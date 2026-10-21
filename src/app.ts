import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveChannel } from './channels';
import { DATA_ROOT, loadOverrides, parseOverrides, PROJECT_ROOT, saveOverrides, SETTINGS_FILE, watchConfig, withOverrides, type Config, type SettingsOverrides } from './config';
import { excitement } from './engine/audio';
import type { ScreenState, UserAction } from './engine/director';
import { channelNetworks, Engine, type TickResult } from './engine/engine';
import type { GameView } from './engine/ranker';
import { espnDateKey } from './espn/client';
import { HighlightService } from './highlights/service';
import { YouTubeClient } from './highlights/youtube';
import { LiveSource, recordingDir } from './espn/source';
import { clock as fmtClock, dailyLogFile, DecisionLog, type LogEntry } from './log';
import { startServer, type LocalServer, type PostResult } from './server/server';
import { effectiveChannels, lineupFile, upgradeLineup } from './providers/lineup';
import { isSportId, SPORTS, sportOf } from './sports';
import type { GameSnapshot, SportId } from './engine/types';
import type { DiscoveredChannel } from './providers/types';
import { demoDeps } from './setup/demo';
import { applyMapping, lineupFromScan, mappingRows } from './setup/lineupEdit';
import { carriedChannels, SetupRunner, type SetupDeps } from './setup/runner';
import { DIAG_STEPS, fieldsFor, getPath, HIDE_PROBE_JS, runStep, type DiagResult, type DiagStep } from './setup/diagnostics';
import { compileRegex } from './providers/types';
import { loadSetup, migrateOwner, needsSetup, saveSetup, type SetupState } from './setup/state';
import { createAdapter, listProviders, previewOverride, readOverrideFile, saveOverride, STATE_DIR } from './providers/registry';
import type { ProviderAdapter } from './providers/types';
import { gameDTO, type AppState, type FeedItem, type PickerDTO, type ScreenDTO } from './server/state';
import { attachShell, effectiveStandby, startShell, type Shell, type SigninStatus } from './shell';
import { autoHomes, recordedFeed, synthFeed, type FeedTarget } from './sim';
import { wantsAllSports } from './ui/ticker/model';
import { normalizeScoreboard } from './espn/normalize';
import { connect, ensureChrome } from './windows/chrome';
import { WindowController } from './windows/controller';
import { cacheFileFor } from './windows/tuner';
import type { BridgeMessage, OverlayState, Popup } from './windows/screen';
import type { SwitchTiming } from './windows/timing';

// The whole app: ESPN data → engine → window controller, plus the UI and local pages.
// Shells: "electron" (default) is one TappedIn window with four Xfinity views and the UI drawn on top;
// "chrome" is the original four Chrome tile windows plus a control panel window.
// Modes:
//   live     real ESPN polling, Xfinity video in four tiles
//   dry-run  real ESPN polling, live data tiles instead of video (no streams used)
//   replay   a recorded (or synthesized) game day on a sped-up clock, data tiles

export interface AppOptions {
  dryRun: boolean;
  /** Run the first-run setup even if it was done before. */
  setup?: boolean;
  /** The first-run setup with nothing real behind it (no window, no streams), for UI work. */
  setupDemo?: boolean;
  replay?: { date: string; fromMs: number; speed: number; synth: boolean };
  homes?: string[];
  /** Pick four home games automatically at start (you can change them in the panel). */
  autoHomes: boolean;
  audioMode?: 'manual' | 'auto';
  record: boolean;
  shell: 'electron' | 'chrome';
}

class Clock {
  private base: number | null = null;
  private realBase = 0;
  constructor(private readonly speed = 1) {}
  /** Replay: start the virtual clock at `t`. */
  start(t: number): void {
    this.base = t;
    this.realBase = Date.now();
  }
  now(): number {
    return this.base === null ? Date.now() : this.base + (Date.now() - this.realBase) * this.speed;
  }
}

const ACTIONS = new Set(['setHome', 'lock', 'unlock', 'force', 'goHome', 'skip', 'cancelAutoPick']);
const FEED_MAX = 150;
const etTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

/** The top bar's height (electron/main.cjs TOP_BAR, --top in src/ui/style.css). */
const TOP_BAR_PX = 36;

export class App {
  private readonly engine: Engine;
  private readonly log: DecisionLog;
  private readonly clock: Clock;
  private readonly labelsFile: string;
  private controller!: WindowController;
  private server!: LocalServer;
  private source: LiveSource | null = null;
  private timers: NodeJS.Timeout[] = [];
  private homesSet = false;
  /** The replay's feed: not started, warming up (before --from), or playing (its ticks are running). */
  private replay: 'idle' | 'warming' | 'playing' = 'idle';
  private focus = 0;
  /** Per-screen fullscreen: the screen filling the window (0: the grid). */
  private fullscreen = 0;
  /** Height above the video grid: the top bar (36 px), or the big ticker covering it. */
  private topInset = TOP_BAR_PX;
  /** Latest games of sports you don't follow, kept only while a ticker shows "all sports". */
  private tickerExtra = new Map<SportId, GameSnapshot[]>();
  /**
   * Where ESPN data goes: the engine, which ignores sports you don't follow; those are kept for the
   * tickers instead when one wants every sport. Live polling and replays both feed through here.
   */
  private readonly ingest: FeedTarget = {
    ingestScoreboard: (body, at, sport = 'cfb') => {
      const snaps = this.engine.ingestScoreboard(body, at, sport);
      if (!this.cfg.sports.enabled.includes(sport) && wantsAllSports(this.cfg.ticker)) this.tickerExtra.set(sport, normalizeScoreboard(body, at, sport));
      return snaps;
    },
    ingestSummary: (id, body, at) => this.engine.ingestSummary(id, body, at),
    ingestSnapshots: (snaps, at) => {
      this.engine.ingestSnapshots(snaps, at);
      if (!wantsAllSports(this.cfg.ticker)) return;
      const other = snaps.filter((g) => !this.cfg.sports.enabled.includes(g.sport));
      for (const sport of new Set(other.map((g) => g.sport))) this.tickerExtra.set(sport, other.filter((g) => g.sport === sport));
    },
    ingestPlays: (id, plays, at) => this.engine.ingestPlays(id, plays, at),
  };
  private stopped = false;
  private stopWatching: (() => void) | null = null;
  private feed: FeedItem[] = [];
  private labels = 0;
  private popupKeys = new Map<number, { key: string; ms: number }>();
  private readonly highlights: HighlightService;
  private shell: Shell | null = null;
  private signin: SigninStatus | null = null;
  /** The config file as loaded, and the settings changed in the app on top of it. */
  private fileCfg: Config;
  private overrides: SettingsOverrides;
  private cfg: Config;
  private lastSwitch = new Map<number, ScreenDTO['lastSwitch']>();
  private broadcastTimer: NodeJS.Timeout | null = null;
  /** The TV service the screens play (first-run setup and the settings page can switch it). */
  private adapter: ProviderAdapter;
  /** First-run setup in progress, else null. */
  private setupRunner: SetupRunner | null = null;
  /** Diagnostics mode, when open. */
  private diag: { results: Partial<Record<DiagStep, DiagResult>>; running: string | null } | null = null;
  private browser: import('playwright-core').Browser | null = null;
  /** First-run setup: done or not, and what it found. */
  private setupState: SetupState;
  /** Screens in the grid (1-4): the setup's choice once setup is done, 4 while it runs. */
  private screenCount: number;

  constructor(
    cfg: Config,
    private readonly opts: AppOptions,
  ) {
    this.fileCfg = cfg;
    this.overrides = loadOverrides();
    const added = upgradeLineup(withOverrides(cfg, this.overrides).provider, STATE_DIR);
    if (added.length) console.log(`Channels: added ${added.length} networks for other sports from your last channel scan (${added.join(', ')})`);
    this.cfg = cfg = resolveConfig(cfg, this.overrides);
    this.topInset = this.tickerTop();
    this.setupState = migrateOwner(STATE_DIR, cfg) ?? loadSetup();
    this.screenCount = needsSetup(this.setupState, cfg) || opts.setup || opts.setupDemo ? 4 : this.setupState.screens;
    this.engine = new Engine(cfg, this.screenCount);
    const ytKey = process.env.YT_API_KEY?.trim();
    const youtube = ytKey
      ? new YouTubeClient({
          apiKey: ytKey,
          channels: [...new Set([...cfg.highlights.youtubeChannels, ...SPORTS.flatMap((m) => m.highlights?.youtubeChannels ?? [])])],
          maxSearchesPerDay: cfg.highlights.maxYoutubeSearchesPerDay,
          minMinutesAfterFinal: cfg.highlights.youtubeMinMinutesAfterFinal,
          cacheFile: path.join(DATA_ROOT, '.state', 'youtube-cache.json'),
        })
      : null;
    this.highlights = new HighlightService(cfg, youtube, (t) => this.info(t));
    if (opts.audioMode) this.engine.setAudioMode(opts.audioMode);
    this.clock = new Clock(opts.replay?.speed ?? 1);
    const logs = path.join(DATA_ROOT, 'logs');
    const file = opts.replay ? path.join(logs, `replay-${opts.replay.date}.jsonl`) : dailyLogFile(DATA_ROOT);
    this.labelsFile = path.join(logs, opts.replay ? `labels-replay-${opts.replay.date}.jsonl` : 'labels.jsonl');
    this.log = new DecisionLog({ file, console: true });
    this.adapter = createAdapter(cfg.provider, { onWarning: (m) => this.info(m) });
  }

  get mode(): AppState['mode'] {
    return this.opts.replay ? 'replay' : this.opts.dryRun ? 'dry-run' : 'live';
  }

  async start(): Promise<void> {
    const cfg = this.cfg;
    this.server = await startServer(cfg.server.port, {
      state: () => this.state(),
      post: (p, b) => this.post(p, b),
      reel: (n) => this.reel(n),
      cardSeconds: () => this.cfg.highlights.cardSeconds,
    });
    this.info(`TappedIn ${this.mode} mode (${this.opts.shell === 'electron' ? 'one window' : 'Chrome tiles'}); switch sensitivity ${cfg.switching.sensitivity}`);
    this.info(`halftime highlights: ESPN clips ${cfg.highlights.espnClips ? 'on' : 'off'}, YouTube ${this.highlights.youtubeEnabled ? 'on' : 'off (set YT_API_KEY in .env to enable)'}`);

    if (this.opts.setupDemo) {
      this.setupRunner = new SetupRunner(
        demoDeps({
          onChange: () => this.pushState(),
          signin: (s) => void this.setupRunner?.onSignin(s),
          finished: (n) => this.info(`setup demo finished with ${n} screen(s); a real run would start the app now`),
        }),
      );
      this.info(`setup demo: open ${this.server.url}/ui in a browser (no window, no streams)`);
      return;
    }
    const inSetup = this.opts.shell === 'electron' && (this.opts.setup || needsSetup(this.setupState, cfg));

    if (this.opts.shell === 'electron') {
      this.shell = await startShell(cfg, `${this.server.url}/ui`, {
        signin: (s) => this.onSignin(s),
        exit: (code) => {
          if (this.stopped) return;
          this.info(`the TappedIn window closed${code ? ` (exit ${code})` : ''}; stopping`);
          void this.stop().then(() => process.exit(0));
        },
        log: (t) => this.info(t),
      }, { provider: this.adapter.config, screens: this.screenCount, spares: inSetup ? 0 : effectiveStandby(cfg, this.adapter.config), signin: startupSignin(this.mode, inSetup) });
      await this.shell.ready;
      await this.attachController();
    } else {
      const { launched } = await ensureChrome(cfg);
      if (launched && this.mode === 'live') this.info('Started TappedIn Chrome. If a tile shows "Signed out of Xfinity", run "npm run login" and sign in.');
      const { browser, context } = await connect(cfg);
      this.controller = new WindowController(cfg, browser, context, this.controllerOpts(), this.controllerEvents());
      await this.controller.open(this.screenCount);
      this.info(`control panel at ${this.server.url}/panel (Alt+P)`);
    }

    this.stopWatching = watchConfig(
      (next) => {
        this.fileCfg = next;
        this.applyConfig();
        this.info(`config reloaded${Object.keys(this.overrides).length ? ` (settings changed in the app still win: ${Object.keys(this.overrides).join(', ')})` : ''}`);
      },
      (msg) => this.info(`config NOT reloaded: ${msg}`),
    );

    if (inSetup) {
      this.setupRunner = new SetupRunner(this.setupDeps());
      this.info('first-run setup: pick your TV service in the TappedIn window');
      this.pushState();
      return;
    }
    this.startNormal();
  }

  /** ESPN data, the engine's ticks and the window checks: the app proper (after setup). */
  private startNormal(): void {
    const cfg = this.cfg;
    if (this.opts.replay) {
      // Diagnostics and setup pause the app, not the replay's feed: resume its ticks instead of starting it over.
      if (this.replay === 'idle') {
        this.replay = 'warming';
        void this.runReplay(this.opts.replay);
      } else if (this.replay === 'playing') this.startTicking();
    } else {
      this.source = new LiveSource(
        cfg,
        {
          scoreboard: (body, at, sport) => this.ingest.ingestScoreboard(body, at, sport),
          summary: (id, body, at) => {
            this.engine.ingestSummary(id, body, at);
            this.highlights.ingestSummary(id, body, at);
          },
          error: (what, err) => this.info(`ESPN ${what} failed: ${err}`),
        },
        {
          date: espnDateKey(),
          interesting: () => this.engine.interestingGameIds(),
          onScreen: () => [...this.engine.relevantGameIds()],
          alsoPoll: () => (wantsAllSports(this.cfg.ticker) ? SPORTS.map((m) => m.id).filter((id) => !this.cfg.sports.enabled.includes(id)) : []),
          recordDir: this.opts.record ? recordingDir(DATA_ROOT, `${espnDateKey()}-live`) : null,
        },
      );
      this.source.start();
      this.startTicking();
    }
    this.timers.push(setInterval(() => void this.controller?.tick().catch((e) => this.info(`window check failed: ${e}`)), 2000));
  }

  private onSignin(s: SigninStatus): void {
    const was = this.signin?.state;
    this.signin = s;
    this.info(`${this.adapter.config.shortName} sign-in: ${s.state}${s.detail ? ` (${s.detail})` : ''}`);
    if (this.setupRunner) void this.setupRunner.onSignin(s);
    else if (s.state === 'ok' && was && was !== 'ok' && this.controller) this.controller.restoreAll();
    this.pushState();
  }

  /** (Re)attach the window controller to the shell's current views (after start or a configure). */
  private async attachController(): Promise<void> {
    const shell = this.shell!;
    const { browser, screens, spares } = await attachShell(this.cfg, shell.layout, 30_000, this.browser ?? undefined);
    this.browser = browser;
    this.controller = new WindowController(this.cfg, browser, null, this.controllerOpts(), this.controllerEvents());
    await this.controller.attach(screens, spares, (screen, view) => shell.present(screen, view));
    this.syncLayout();
  }

  /** Tell the window where the grid starts and which screen is fullscreen (it resizes views, never reloads them). */
  private syncLayout(): void {
    if (this.fullscreen > this.screenCount) this.setFullscreen(0);
    this.shell?.setLayout({ focus: this.fullscreen, top: this.topInset });
  }

  /** Per-screen fullscreen on (1–4) or off (0). Every screen keeps switching; sound follows the fullscreen one. */
  private setFullscreen(screen: number): PostResult {
    if (!Number.isInteger(screen) || screen < 0 || screen > this.screenCount) return { ok: false, message: 'bad screen' };
    if (screen === this.fullscreen) return { ok: true };
    this.fullscreen = screen;
    const d = this.engine.holdAudio(screen, this.clock.now());
    if (d) this.writeEntry({ type: 'audio', ...d });
    if (this.engine.audio.focus !== this.focus) {
      this.focus = this.engine.audio.focus;
      void this.controller?.setAudioFocus(this.focus);
    }
    this.shell?.setLayout({ focus: screen, top: this.topInset });
    this.info(screen ? `screen ${screen} fullscreen` : 'back to the grid');
    this.refreshOverlays();
    this.pushState();
    return { ok: true };
  }

  /** Switch to another TV service: the window rebuilds its views in that service's own browser profile and signs in. */
  private async switchProvider(id: string): Promise<void> {
    this.overrides = { ...this.overrides, provider: id };
    saveOverrides(this.overrides);
    this.cfg = resolveConfig(this.fileCfg, this.overrides);
    this.adapter = createAdapter(id, { onWarning: (m) => this.info(m) });
    this.signin = null;
    await this.shell!.configure({ provider: this.adapter.config, screens: this.screenCount, spares: 0, signin: 'now' });
    await this.attachController();
    this.applyConfig();
  }

  /** First-run setup is done: size the grid, add standby views if wanted, and start the app proper. */
  private async finishSetup(screens: number): Promise<void> {
    this.setupState = loadSetup();
    this.screenCount = screens;
    this.engine.resizeScreens(screens);
    this.setupRunner = null;
    await this.shell!.configure({ provider: this.adapter.config, screens, spares: effectiveStandby(this.cfg, this.adapter.config), signin: 'defer' });
    await this.attachController();
    this.homesSet = false;
    if (!this.timers.length) this.startNormal();
    this.info(`setup done: ${this.adapter.config.name}, ${screens} screen(s)`);
    this.pushState();
  }

  private setupDeps(): SetupDeps {
    return {
      providers: () => listProviders(),
      useProvider: (id) => this.switchProvider(id),
      retrySignin: () => this.shell?.handoff(),
      discover: async () => this.adapter.discoverLineup(this.controller.screens[0].page, this.controller.tools),
      screens: () =>
        this.controller.screens.map((sw) => ({
          tune: (ch) => sw.tuneChannel(ch),
          health: async () => {
            const h = await sw.checkHealth();
            return h ? { state: h.state, detail: h.detail } : null;
          },
          release: () => sw.release(),
        })),
      channels: () => this.cfg.channels,
      saveLineup: (lineup, rows) => this.saveLineup(lineup, rows),
      saveSetup: (patch) => {
        this.setupState = { ...this.setupState, ...patch };
        saveSetup(this.setupState);
      },
      finished: (n) => this.finishSetup(n),
      startupTimeoutMs: this.cfg.windows.startupTimeoutSeconds * 1000,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      onChange: () => this.pushState(),
    };
  }

  /** Save a scanned lineup (and the raw guide rows, for the channel mapping editor) and use it at once. */
  private saveLineup(lineup: Config['channels'], rows: DiscoveredChannel[]): void {
    this.writeLineup(lineup);
    writeFileSync(lineupFile(this.adapter.config.id, STATE_DIR).replace(/\.json$/, '.scan.json'), JSON.stringify(rows, null, 2));
    this.applyConfig();
  }

  private controllerOpts() {
    return {
      dryRun: this.mode !== 'live',
      serverUrl: this.server.url,
      stateFile: path.join(DATA_ROOT, '.state', 'tiles.json'),
      cacheFile: cacheFileFor(this.adapter.config.id, STATE_DIR),
      adapter: this.adapter,
    };
  }

  private controllerEvents() {
    const service = () => this.adapter.config.shortName;
    return {
      tuned: (s: number, i: { gameId: string; channelName: string; channel: number; path: string; ms: number }) => {
        this.info(`now on ${i.channelName} (${i.channel}) via ${i.path} in ${(i.ms / 1000).toFixed(1)}s`, s);
        // The service can still be signed in from before even when the sign-in step timed out.
        if (this.signin && this.signin.state !== 'ok') this.signin = { state: 'ok', detail: `${service()} is playing` };
        this.pushState();
      },
      streamProblem: (s: number, i: { state: string; detail: string; hint: string }) => {
        this.info(`stream problem ${i.state}: ${i.detail} -- ${i.hint}`, s);
        if (i.state === 'LOGIN_REQUIRED' && this.shell) {
          this.info(`${service()} signed out; signing in again`);
          this.shell.handoff();
        }
        this.handle(this.engine.act({ type: 'streamError', screen: s, detail: `${i.state}: ${i.detail}` }, this.clock.now()));
      },
      streamRecovered: (s: number) => this.handle(this.engine.act({ type: 'streamOk', screen: s }, this.clock.now())),
      limitLearned: (l: number, d: string) => this.info(`${service()} stream limit hit (${d}); video on ${l} screen(s), live data on the rest`),
      info: (t: string) => this.info(t),
      bridge: (s: number, msg: BridgeMessage) => this.onBridge(s, msg),
      switchTiming: (t: SwitchTiming) => {
        this.log.write({ type: 'timing', at: Date.now(), ...t });
        this.pushState();
      },
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.source?.stop();
    this.stopWatching?.();
    if (this.shell) this.shell.quit();
    else await this.controller?.close();
    await this.server?.close();
    this.info('stopped');
  }

  /** Config file + settings changed in the app → every part of the app. */
  private applyConfig(): void {
    const next = resolveConfig(this.fileCfg, this.overrides);
    this.cfg = next;
    this.engine.setConfig(next);
    this.source?.setConfig(next);
    this.controller?.setConfig(next);
    this.highlights.setConfig(next);
    if (!wantsAllSports(next.ticker)) this.tickerExtra.clear();
    for (const sport of next.sports.enabled) this.tickerExtra.delete(sport as SportId);
    const top = this.tickerTop();
    if (top !== this.topInset) {
      this.topInset = top;
      this.syncLayout();
    }
    this.pushState();
  }

  /** The big ticker covers the top bar (one-window app only): the grid starts below it. */
  private tickerTop(): number {
    return this.opts.shell === 'electron' && this.cfg.ticker.big ? this.cfg.ticker.height : TOP_BAR_PX;
  }

  private changeSettings(body: Record<string, unknown>): PostResult {
    if (body.reset === true) {
      // Setup choices (which service, how many standby streams) and the tickers aren't tuning: reset keeps them.
      const { provider, standbyViews, screenSports, ticker } = this.overrides;
      this.overrides = { ...(provider ? { provider } : {}), ...(standbyViews !== undefined ? { standbyViews } : {}), ...(screenSports ? { screenSports } : {}), ...(ticker ? { ticker } : {}) };
      saveOverrides(this.overrides);
      this.applyConfig();
      this.engine.setAudioMode(this.cfg.audio.mode);
      this.info('settings reset to the config file');
      return { ok: true };
    }
    let change: SettingsOverrides;
    try {
      change = parseOverrides(body);
    } catch (err) {
      return { ok: false, message: String(err instanceof Error ? err.message : err) };
    }
    // Ticker settings merge one key at a time (each switch posts only what it changes).
    this.overrides = { ...this.overrides, ...change, ...(change.ticker ? { ticker: { ...this.overrides.ticker, ...change.ticker } } : {}) };
    saveOverrides(this.overrides);
    this.applyConfig();
    this.info(`settings: ${Object.entries(change).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')} (saved in ${path.relative(DATA_ROOT, SETTINGS_FILE)})`);
    return { ok: true };
  }

  // ---- inputs: panel API, tile hotkeys / pop-up clicks -------------------------------------

  private async post(p: string, body: Record<string, unknown>): Promise<PostResult> {
    const screen = Number(body.screen);
    const validScreen = Number.isInteger(screen) && screen >= 1 && screen <= this.screenCount;
    switch (p) {
      case '/api/action': {
        const type = String(body.type);
        if (!ACTIONS.has(type) || !validScreen) return { ok: false, message: 'bad action' };
        if ((type === 'setHome' || type === 'force') && typeof body.gameId !== 'string') return { ok: false, message: 'gameId required' };
        return this.userAction({ type, screen, gameId: body.gameId } as UserAction);
      }
      case '/api/audio': {
        if (body.mode === 'manual' || body.mode === 'auto') this.setSoundMode(body.mode);
        // { screen: n } puts sound on screen n; 0 mutes every screen.
        const focus = Number(body.screen ?? body.focus);
        if (Number.isInteger(focus) && focus >= 0 && focus <= this.screenCount) this.focusAudio(focus);
        this.refreshOverlays();
        this.pushState();
        return { ok: true };
      }
      case '/api/settings':
        return this.changeSettings(body);
      case '/api/view':
        // { fullscreen: n }: screen n fills the window; 0 is the grid.
        return this.setFullscreen(Number(body.fullscreen));
      case '/api/screen-sport': {
        // Choose a screen's sport before its game (the game list opens on it).
        const sport = String(body.sport);
        if (!validScreen || !isSportId(sport)) return { ok: false, message: 'bad sport' };
        this.setScreenSport(screen, sport);
        this.pushState();
        return { ok: true };
      }
      case '/api/all-screens-sport': {
        const sport = String(body.sport);
        if (!isSportId(sport)) return { ok: false, message: 'bad sport' };
        return this.allScreensSport(sport);
      }
      case '/api/diag/open':
      case '/api/diag/close':
      case '/api/diag/run':
      case '/api/diag/preview':
      case '/api/diag/save':
        return this.diagAction(p.slice('/api/diag/'.length), body);
      case '/api/service/switch':
      case '/api/service/logout':
      case '/api/service/rescan':
      case '/api/service/map':
      case '/api/service/streams':
      case '/api/service/standby':
        return this.serviceAction(p.slice('/api/service/'.length), body);
      case '/api/setup/go':
      case '/api/setup/choose':
      case '/api/setup/signin':
      case '/api/setup/scan':
      case '/api/setup/play':
      case '/api/setup/streams':
      case '/api/setup/finish':
        return this.setupAction(p.slice('/api/setup/'.length), body);
      case '/api/label':
        if (!validScreen || (body.label !== 'break' && body.label !== 'live')) return { ok: false, message: 'bad label' };
        return this.label(screen, body.label);
      case '/api/hotkey':
        this.hotkey(validScreen ? screen : 0, String(body.key));
        return { ok: true };
      default:
        return { ok: false, message: 'unknown endpoint' };
    }
  }

  // ---- the settings page's "TV service" tab -------------------------------------------------

  private scanRows(): DiscoveredChannel[] {
    try {
      return JSON.parse(readFileSync(lineupFile(this.adapter.config.id, STATE_DIR).replace(/\.json$/, '.scan.json'), 'utf8'));
    } catch {
      return [];
    }
  }

  private serviceDTO(): AppState['service'] {
    const c = this.adapter.config;
    const rows = this.scanRows();
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      documentedMaxStreams: c.documentedMaxStreams,
      measuredStreams: this.setupState.measuredStreams,
      screens: this.screenCount,
      standbyViews: effectiveStandby(this.cfg, c),
      lineup: mappingRows(this.cfg.channels, rows),
      rows: rows.map((r, index) => ({ index, label: r.label, number: r.number })),
      lineupAt: this.setupState.lineupAt,
      testedAt: this.setupState.testedAt,
    };
  }

  /** Leave the app proper (ESPN polling, engine ticks, window checks) while setup steps use the screens. */
  private stopNormal(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.source?.stop();
    this.source = null;
  }

  /** Back to first-run setup with all four views (switch service, log out, re-test streams). */
  private enterSetup(): SetupRunner {
    this.stopNormal();
    this.screenCount = 4;
    this.engine.resizeScreens(4);
    this.setupRunner = new SetupRunner(this.setupDeps());
    this.pushState();
    return this.setupRunner;
  }

  /** After a configure (new controller), re-apply what every screen is supposed to show. */
  private resyncController(): void {
    const views = this.engine.views();
    for (const sc of this.engine.director.screens) {
      if (sc.showing.kind === 'game') this.controller.execute({ type: 'tune', screen: sc.id, gameId: sc.showing.gameId, channel: sc.showing.channel, channelName: views.get(sc.showing.gameId)?.channel?.name ?? String(sc.showing.channel) });
      else if (sc.showing.kind === 'halftime') this.controller.execute({ type: 'showHalftime', screen: sc.id, homeGameId: sc.homeGameId ?? '' });
    }
  }

  private serviceAction(action: string, body: Record<string, unknown>): PostResult | Promise<PostResult> {
    if (!this.shell) return { ok: false, message: 'only in the TappedIn window (npm start)' };
    if (this.setupRunner && action !== 'map') return { ok: false, message: 'finish the setup first' };
    const bg = (what: string, p: Promise<unknown>) => void p.catch((e) => this.info(`${what} failed: ${e}`));
    switch (action) {
      case 'switch': {
        const id = String(body.id ?? '');
        if (!listProviders().some((p) => p.id === id && p.status !== 'unsupported')) return { ok: false, message: 'pick a supported service' };
        bg('switching service', this.enterSetup().choose(id));
        return { ok: true };
      }
      case 'logout': {
        const id = this.adapter.config.id;
        const runner = this.enterSetup();
        bg('logging out', this.shell.logout().then(() => runner.choose(id)));
        this.info(`signed out of ${this.adapter.config.name} (its cookies in TappedIn's browser profile were cleared)`);
        return { ok: true };
      }
      case 'rescan':
        return this.rescan();
      case 'map': {
        const key = String(body.key ?? '');
        const row = body.row === null ? null : Number(body.row);
        if (row !== null && !Number.isInteger(row)) return { ok: false, message: 'bad row' };
        try {
          const rows = this.scanRows();
          this.writeLineup(applyMapping(this.cfg.channels, rows, key, row));
          this.applyConfig();
          this.info(`channel mapping: ${key} → ${row === null ? 'not in my lineup' : rows[row]?.label}`);
          return { ok: true };
        } catch (err) {
          return { ok: false, message: String(err instanceof Error ? err.message : err) };
        }
      }
      case 'streams': {
        const id = this.adapter.config.id;
        const runner = this.enterSetup();
        bg('stream test', this.shell.configure({ provider: this.adapter.config, screens: 4, spares: 0, signin: 'defer' }).then(() => this.attachController()).then(() => runner.resume(id)));
        return { ok: true };
      }
      case 'standby': {
        const n = Number(body.n);
        if (!Number.isInteger(n) || n < 0 || n > 2) return { ok: false, message: 'standby views: 0, 1 or 2' };
        this.overrides = { ...this.overrides, standbyViews: n };
        saveOverrides(this.overrides);
        this.applyConfig();
        bg('standby change', this.shell.configure({ provider: this.adapter.config, screens: this.screenCount, spares: n, signin: 'defer' }).then(() => this.attachController()).then(() => this.resyncController()));
        this.info(`standby views: ${n}`);
        return { ok: true };
      }
    }
    return { ok: false, message: 'unknown service action' };
  }

  // ---- diagnostics ---------------------------------------------------------------------------

  private diagDTO(): AppState['diag'] {
    if (!this.diag) return null;
    const c = this.adapter.config;
    const values: Record<string, unknown> = {};
    for (const step of DIAG_STEPS) for (const f of fieldsFor(step, c)) values[f] = getPath(c, f);
    return { providerId: c.id, providerName: c.name, status: c.status, results: this.diag.results, values, override: readOverrideFile(c.id), running: this.diag.running, appVersion: appVersion() };
  }

  private async diagAction(action: string, body: Record<string, unknown>): Promise<PostResult> {
    if (!this.shell) return { ok: false, message: 'only in the TappedIn window (npm start)' };
    switch (action) {
      case 'open':
        if (!this.diag) {
          if (!this.setupRunner) this.stopNormal(); // auto-switching pauses: the steps use screen 1
          this.diag = { results: {}, running: null };
        }
        this.pushState();
        return { ok: true };
      case 'close':
        this.diag = null;
        if (!this.setupRunner && !this.timers.length) {
          this.controller.restoreAll();
          this.resyncController();
          this.startNormal();
        }
        this.pushState();
        return { ok: true };
      case 'run': {
        if (!this.diag) return { ok: false, message: 'open diagnostics first' };
        const step = String(body.step) as DiagStep;
        if (!DIAG_STEPS.includes(step)) return { ok: false, message: 'unknown step' };
        if (this.diag.running) return { ok: false, message: `busy: ${this.diag.running}` };
        this.diag.running = step;
        this.pushState();
        void runStep(step, this.diagDeps()).then((r) => {
          if (!this.diag) return;
          this.diag.results[step] = r;
          this.diag.running = null;
          this.info(`diagnostics ${step}: ${r.pass ? 'pass' : 'FAIL'} (${r.summary})`);
          this.pushState();
        });
        return { ok: true };
      }
      case 'preview':
      case 'save': {
        const override = body.override;
        if (!override || typeof override !== 'object' || Array.isArray(override)) return { ok: false, message: 'the override must be a JSON object' };
        const id = this.adapter.config.id;
        if (action === 'preview') {
          const { warnings } = previewOverride(id, override as Record<string, unknown>);
          return warnings.length ? { ok: false, message: warnings.join('; ') } : { ok: true, message: 'looks good' };
        }
        try {
          saveOverride(id, override as Record<string, unknown>);
        } catch (err) {
          return { ok: false, message: String(err instanceof Error ? err.message : err) };
        }
        await this.reloadProvider();
        this.info(`diagnostics: saved your fixes for ${this.adapter.config.name} in .state/providers/${id}.json`);
        return { ok: true, message: 'saved' };
      }
    }
    return { ok: false, message: 'unknown diagnostics action' };
  }

  /** The provider's config changed (diagnostics fixes): rebuild the adapter and the window's views. */
  private async reloadProvider(): Promise<void> {
    this.adapter = createAdapter(this.adapter.config.id, { onWarning: (m) => this.info(m) });
    await this.shell!.configure({ provider: this.adapter.config, screens: this.screenCount, spares: this.shell!.layout.spares, signin: 'defer' });
    await this.attachController();
    this.pushState();
  }

  private diagDeps() {
    const sw = () => this.controller.screens[0];
    const channel = () => carriedChannels(this.cfg.channels)[0];
    return {
      config: this.adapter.config,
      signinCheck: () => this.shell!.signinCheck(),
      discover: () => this.adapter.discoverLineup(sw().page, this.controller.tools),
      tune: async () => {
        const ch = channel();
        if (!ch) throw new Error('no channels in the lineup: run the channel scan first');
        const out = await sw().tuneChannel(ch);
        return { path: out.path, ms: out.ms, url: sw().page.url(), onChannel: this.adapter.onChannel(sw().page.url(), ch), channel: ch.name };
      },
      watch: async () => {
        let last: { state: import('./windows/health').StreamState; detail: string } = { state: 'NO_VIDEO', detail: 'waiting for the player' };
        const until = Date.now() + this.cfg.windows.startupTimeoutSeconds * 1000;
        while (Date.now() < until) {
          const h = await sw().checkHealth().catch(() => null);
          if (h) last = { state: h.state, detail: h.detail };
          if (last.state === 'PLAYING') break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        return last;
      },
      hideProbe: async () => {
        const re = compileRegex(this.adapter.config.shell.playerUrl);
        return (await sw().page.evaluate(HIDE_PROBE_JS(re.source, re.flags))) as import('./setup/diagnostics').HideProbe;
      },
    };
  }

  /** Read the guide again on screen 1 (it shows the guide for a few seconds), then put screen 1 back. */
  private async rescan(): Promise<PostResult> {
    try {
      const rows = await this.adapter.discoverLineup(this.controller.screens[0].page, this.controller.tools);
      const r = lineupFromScan(rows);
      if (!r.found.length) return { ok: false, message: `No sports channels found (${rows.length} guide rows read); kept your current lineup. Try Diagnostics.` };
      this.saveLineup(r.lineup, rows);
      this.setupState = { ...this.setupState, lineupAt: new Date().toISOString() };
      saveSetup(this.setupState);
      return { ok: true, message: `Found ${r.found.length} networks; missing ${r.missing.join(', ') || 'none'}` };
    } catch (err) {
      return { ok: false, message: `Couldn't read the guide: ${String(err instanceof Error ? err.message : err).split('\n')[0]}` };
    } finally {
      this.controller.restore(1);
    }
  }

  private writeLineup(lineup: Config['channels']): void {
    const file = lineupFile(this.adapter.config.id, STATE_DIR);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(lineup, null, 2));
  }

  /** First-run setup buttons. Long steps run in the background; the UI follows the state. */
  private setupAction(action: string, body: Record<string, unknown>): PostResult {
    const r = this.setupRunner;
    if (!r) return { ok: false, message: 'setup is not running' };
    if (r.view().busy && action !== 'go') return { ok: false, message: `busy: ${r.view().busy}` };
    const bg = (p: Promise<void>) => void p.catch((e) => this.info(`setup ${action} failed: ${e}`));
    switch (action) {
      case 'go':
        if (body.step !== 'welcome' && body.step !== 'service') return { ok: false, message: 'bad step' };
        r.go(body.step);
        return { ok: true };
      case 'choose':
        if (typeof body.id !== 'string' || !listProviders().some((p) => p.id === body.id && p.status !== 'unsupported')) return { ok: false, message: 'pick a supported service' };
        bg(r.choose(body.id));
        return { ok: true };
      case 'signin':
        r.retrySignin();
        return { ok: true };
      case 'scan':
        bg(r.checkAll());
        return { ok: true };
      case 'play':
        bg(r.checkPlayback());
        return { ok: true };
      case 'streams':
        bg(r.streamTest());
        return { ok: true };
      case 'finish':
        bg(r.finish(Number(body.screens) || 1));
        return { ok: true };
    }
    return { ok: false, message: 'unknown setup action' };
  }

  /** Sound mode, saved in .state/settings.json like the other Basic settings. */
  private setSoundMode(mode: 'manual' | 'auto'): void {
    this.engine.setAudioMode(mode);
    this.overrides = { ...this.overrides, audioMode: mode };
    saveOverrides(this.overrides);
    this.info(`sound mode: ${mode}`);
  }

  private onBridge(screen: number, msg: BridgeMessage): void {
    if (msg.type === 'hotkey') this.hotkey(screen, msg.key);
    else if (msg.type === 'pick' && screen > 0) this.userAction({ type: 'setHome', screen, gameId: msg.gameId });
    else if (msg.type === 'keep' && screen > 0) this.userAction({ type: 'cancelAutoPick', screen });
  }

  private hotkey(screen: number, key: string): void {
    const sc = screen > 0 ? this.engine.director.screens[screen - 1] : undefined;
    switch (key) {
      case 'panel':
        void this.controller.togglePanel();
        return;
      case 'audioMode': {
        this.setSoundMode(this.engine.audio.mode === 'auto' ? 'manual' : 'auto');
        this.refreshOverlays();
        return;
      }
      case 'audio1':
      case 'audio2':
      case 'audio3':
      case 'audio4':
        this.focusAudio(Number(key.slice(-1)));
        return;
    }
    if (!sc) return; // the keys below act on the tile they were pressed in
    if (key === 'lock') this.userAction({ type: sc.mode === 'LOCKED' ? 'unlock' : 'lock', screen });
    else if (key === 'home') this.userAction({ type: 'goHome', screen });
    else if (key === 'skip') this.userAction({ type: 'skip', screen });
    else if (key === 'labelBreak') this.label(screen, 'break');
    else if (key === 'labelLive') this.label(screen, 'live');
  }

  private userAction(action: UserAction): PostResult {
    const res = this.engine.act(action, this.clock.now());
    this.handle(res);
    this.refreshOverlays();
    this.pushState();
    const rejected = res.decisions.find((d) => d.rule === 'USER_REJECTED');
    return rejected ? { ok: false, message: rejected.reasons.join('; ') } : { ok: true };
  }

  /** Each screen's sport as remembered (null: none chosen yet). */
  private screenSports(): (SportId | null)[] {
    const saved = this.overrides.screenSports ?? [];
    return Array.from({ length: this.screenCount }, (_, i) => (saved[i] && isSportId(saved[i]) ? saved[i] : null));
  }

  private setScreenSport(screen: number, sport: SportId): void {
    const next = this.screenSports();
    if (next[screen - 1] === sport) return;
    next[screen - 1] = sport;
    this.overrides = { ...this.overrides, screenSports: next.map((x) => x ?? '') };
    saveOverrides(this.overrides);
  }

  /**
   * "All screens: NBA": every screen's sport becomes NBA, and each screen not already on an NBA game
   * gets the best NBA game nobody else is showing (the same pick as at startup). Locked screens keep
   * their game. You can still change any screen's game afterward.
   */
  private allScreensSport(sport: SportId): PostResult {
    const now = this.clock.now();
    const views = this.engine.views();
    for (let i = 1; i <= this.screenCount; i++) this.setScreenSport(i, sport);
    const screens = this.engine.director.screens;
    const taken = new Set(screens.flatMap((sc) => (sc.homeGameId && views.get(sc.homeGameId)?.game.sport === sport ? [sc.homeGameId] : [])));
    const picks = autoHomes(views, now, 12, Array(12).fill(sport)).filter((id) => views.get(id)?.game.sport === sport && !taken.has(id));
    let changed = 0;
    for (const sc of screens) {
      const homeSport = sc.homeGameId ? views.get(sc.homeGameId)?.game.sport : null;
      if (homeSport === sport || sc.mode === 'LOCKED') continue;
      const gameId = picks.shift();
      if (!gameId) break;
      this.handle(this.engine.act({ type: 'setHome', screen: sc.id, gameId }, now));
      changed++;
    }
    this.info(`all screens: ${sportOf(sport).name} (${changed} screen${changed === 1 ? '' : 's'} switched to a new game)`);
    this.refreshOverlays();
    this.pushState();
    const need = screens.filter((sc) => sc.mode !== 'LOCKED' && (sc.homeGameId ? views.get(sc.homeGameId)?.game.sport : null) !== sport).length;
    return changed < need ? { ok: true, message: `Only ${changed} watchable ${sportOf(sport).name} game${changed === 1 ? '' : 's'} free right now; pick the rest from each screen's list.` } : { ok: true };
  }

  private focusAudio(screen: number): void {
    const d = this.engine.focusAudio(screen, this.clock.now());
    this.writeEntry({ type: 'audio', ...d });
    this.focus = screen;
    void this.controller.setAudioFocus(screen);
    this.refreshOverlays();
  }

  /** "What this screen shows right now is a break / is live": ground truth for tuning. */
  private label(screen: number, label: 'break' | 'live'): PostResult {
    const sc = this.engine.director.screens[screen - 1];
    const gameId = sc?.showing.kind === 'game' ? sc.showing.gameId : null;
    if (!gameId) return { ok: false, message: 'this screen is not showing a game' };
    const view = this.engine.views().get(gameId);
    const a = view?.assessment;
    const entry = {
      at: this.clock.now(),
      screen,
      gameId,
      game: view?.game.shortName ?? gameId,
      label,
      showing: gameId === sc.homeGameId ? 'home' : 'fill-in',
      detector: a ? { state: a.state, score: a.score, signals: a.signals.map((s) => ({ name: s.name, weight: s.weight })), reasons: a.reasons } : null,
      detail: view?.game.detail ?? null,
    };
    mkdirSync(path.dirname(this.labelsFile), { recursive: true });
    appendFileSync(this.labelsFile, JSON.stringify(entry) + '\n');
    this.labels++;
    const agree = a ? (label === 'break') === (a.state === 'BREAK') : null;
    const text = `label "${label}" for ${entry.game}; detector said ${a ? `${a.state} ${a.score.toFixed(2)}` : 'nothing'}${agree === false ? ' (DISAGREES)' : ''}`;
    this.pushFeed({ at: entry.at, kind: 'label', screen, text });
    this.log.write({ type: 'info', at: entry.at, text: `[S${screen}] ${text}` });
    return { ok: true, message: text };
  }

  // ---- engine loop --------------------------------------------------------------------------

  private startTicking(): void {
    const ms = (this.cfg.director.tickSeconds * 1000) / (this.opts.replay?.speed ?? 1);
    this.timers.push(setInterval(() => this.tick(), Math.max(100, ms)));
  }

  private snapshots() {
    return this.engine.store.all().map((g) => g.snap);
  }

  private reel(screen: number): { items: unknown[]; youtube: boolean } {
    const sc = this.engine.director.screens[screen - 1];
    return { items: this.highlights.reel(sc?.homeGameId ?? null, this.snapshots(), this.clock.now()), youtube: this.highlights.youtubeEnabled };
  }

  private tick(): void {
    const now = this.clock.now();
    this.handle(this.engine.tick(now));
    this.highlights.noteGames(this.snapshots(), now);
    // Live: wait for every followed sport's first scoreboard (they arrive a few seconds apart), so the
    // startup pick sees the whole slate, not just the first sports polled.
    const slateReady = !this.source || this.source.firstRoundDone();
    if (!this.homesSet && this.engine.store.all().length && slateReady) {
      this.homesSet = true;
      const homes = this.opts.homes?.length ? this.opts.homes : this.opts.autoHomes ? autoHomes(this.engine.views(), now, this.screenCount, this.screenSports()) : [];
      homes.slice(0, this.screenCount).forEach((gameId, i) => this.handle(this.engine.act({ type: 'setHome', screen: i + 1, gameId }, now)));
      if (!homes.length) this.info('No home games yet: pick them in the control panel (Alt+P).');
    }
    if (this.engine.audio.focus !== this.focus) {
      this.focus = this.engine.audio.focus;
      void this.controller.setAudioFocus(this.focus);
    }
    const views = this.engine.views();
    this.controller.setExcitement(new Map(this.engine.director.screens.map((s) => [s.id, excitement(s, views).score])));
    for (const s of this.engine.director.screens) this.controller.setHomeChannel(s.id, (s.homeGameId && views.get(s.homeGameId)?.channel?.number) || null);
    this.refreshOverlays(views, now);
    this.pushState();
  }

  /** Send the state to the UI soon (several changes in a burst go out once). */
  private pushState(): void {
    if (this.broadcastTimer || !this.server) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      if (!this.stopped) this.server.broadcast(this.state());
    }, 80);
  }

  private refreshOverlays(views = this.engine.views(), now = this.clock.now()): void {
    if (!this.controller) return;
    for (const s of this.engine.director.screens) {
      this.controller.setBadge(s.id, this.badgeFor(s, views, now));
      this.controller.setPopup(s.id, this.popupFor(s, views, now));
    }
  }

  private handle(res: TickResult): void {
    for (const d of res.decisions) {
      this.writeEntry({ type: 'decision', ...d });
      if (d.switched) this.lastSwitch.set(d.screen, { at: d.at, rule: d.rule, reasons: d.reasons.slice(0, 4) });
      if ((d.rule === 'USER_SET_HOME' || d.rule === 'AUTO_PICK') && d.gameId) {
        const sport = this.engine.store.get(d.gameId)?.snap.sport;
        if (sport) this.setScreenSport(d.screen, sport);
      }
      // Warm the highlight cache as soon as a screen goes to halftime.
      if (d.rule === 'HALFTIME') void this.highlights.refresh(this.snapshots(), d.gameId ?? null, this.clock.now());
    }
    for (const a of res.assessments) this.writeEntry({ type: 'assess', ...a });
    for (const a of res.audio) this.writeEntry({ type: 'audio', ...a });
    for (const c of res.commands) this.controller.execute(c);
  }

  private writeEntry(e: LogEntry): void {
    this.log.write(e);
    if (e.type === 'decision' && e.rule !== 'HOLD_DWELL') {
      this.pushFeed({ at: e.at, kind: e.switched ? 'switch' : 'note', screen: e.screen, text: `${e.rule} ${e.switched ? `${e.from} -> ${e.to}` : e.from} | ${e.reasons.slice(0, 2).join(' | ')}` });
    } else if (e.type === 'assess' && e.relevant) {
      this.pushFeed({ at: e.at, kind: 'game', screen: null, text: `${e.game} ${e.from ?? '-'} -> ${e.to}${e.reasons[0] ? ` | ${e.reasons[0]}` : ''}` });
    } else if (e.type === 'audio') {
      this.pushFeed({ at: e.at, kind: 'audio', screen: e.to, text: `sound -> S${e.to} (${e.mode}) | ${e.reason}` });
    }
  }

  private pushFeed(item: FeedItem): void {
    this.feed.push(item);
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
  }

  private info(text: string, screen: number | null = null): void {
    const at = this.clock.now();
    this.log.write({ type: 'info', at, text: screen ? `[S${screen}] ${text}` : text });
    this.pushFeed({ at, kind: 'info', screen, text });
  }

  // ---- what the tiles and panel show ------------------------------------------------------

  private badgeFor(sc: ScreenState, views: Map<string, GameView>, now: number): OverlayState['badge'] {
    const home = sc.homeGameId ? views.get(sc.homeGameId) : undefined;
    const on = sc.showing.kind === 'game' ? views.get(sc.showing.gameId) : undefined;
    const sound = sc.id === this.engine.audio.focus ? ' \u{1F50A}' : '';
    const s = `S${sc.id}`;
    switch (sc.mode) {
      case 'HOME': {
        const st = home?.assessment.state ?? 'UNKNOWN';
        const tone = st === 'BREAK' ? 'break' : st === 'LIVE' ? 'live' : st === 'FINAL' ? 'final' : 'idle';
        return { text: `${s} ${st === 'BREAK' ? 'BREAK?' : st} · ${home?.game.shortName ?? ''}${sound}`, tone };
      }
      case 'FILL_IN':
        return { text: `${s} FILL-IN · ${on?.game.shortName ?? ''}${on && sportOf(on.game.sport).excitement(on.game).hot ? ` (${sportOf(on.game.sport).excitement(on.game).hot!.label})` : ''} · ${home?.game.shortName ?? ''} in break${sound}`, tone: 'break' };
      case 'GAME_OVER': {
        const left = sc.gameOver?.autoPickAt ? Math.max(0, Math.round((sc.gameOver.autoPickAt - now) / 1000)) : null;
        return { text: `${s} FINAL · ${home?.game.shortName ?? ''}${left !== null ? ` · next game in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''}${sound}`, tone: 'final' };
      }
      case 'LOCKED':
        return { text: `${s} LOCKED · ${on?.game.shortName ?? ''} · Alt+H for home${sound}`, tone: 'idle' };
      case 'ERROR':
        return { text: `${s} ERROR${sound}`, tone: 'error' };
      default:
        return null;
    }
  }

  private pickerFor(sc: ScreenState, views: Map<string, GameView>): PickerDTO | null {
    if (sc.mode !== 'GAME_OVER') return null;
    const home = sc.homeGameId ? views.get(sc.homeGameId)?.game : undefined;
    const onScreen = new Map<string, number>();
    for (const o of this.engine.director.screens) if (o.id !== sc.id && o.showing.kind === 'game') onScreen.set(o.showing.gameId, o.id);
    const watchable = [...views.values()].filter((v) => v.channel && v.game.id !== sc.homeGameId);
    // The finished game's sport first, then the other sports in picker order.
    const own = home?.sport;
    const rank = (v: GameView) => (v.game.sport === own ? -1 : SPORTS.findIndex((m) => m.id === v.game.sport));
    const margin = (v: GameView) => Math.abs(v.game.home.score - v.game.away.score);
    const live = watchable
      .filter((v) => v.game.phase === 'LIVE' || v.game.phase === 'HALFTIME')
      .sort((a, b) => rank(a) - rank(b) || margin(a) - margin(b))
      .map((v) => {
        const hot = sportOf(v.game.sport).excitement(v.game).hot;
        return {
          id: v.game.id,
          sport: v.game.sport,
          label: `${v.game.away.abbr} ${v.game.away.score}-${v.game.home.score} ${v.game.home.abbr}`,
          detail: [sportOf(v.game.sport).short, v.game.detail.replace(/^\d{1,2}:\d{2} - /, ''), v.channel!.name, hot?.label ?? '', onScreen.has(v.game.id) ? `on S${onScreen.get(v.game.id)}` : ''].filter(Boolean).join(' · '),
        };
      });
    const later = watchable
      .filter((v) => v.game.phase === 'PRE')
      .sort((a, b) => rank(a) - rank(b) || String(a.game.startTime).localeCompare(String(b.game.startTime)))
      .map((v) => ({ id: v.game.id, sport: v.game.sport, label: v.game.shortName, detail: `${sportOf(v.game.sport).short} · ${v.game.startTime ? etTime(v.game.startTime) : ''} · ${v.channel!.name} ${v.channel!.number}` }));
    return { title: home ? `Final: ${home.away.abbr} ${home.away.score}-${home.home.score} ${home.home.abbr}. Pick the next game` : 'Pick the next game', live, later };
  }

  private popupFor(sc: ScreenState, views: Map<string, GameView>, now: number): Popup | null {
    const picker = this.pickerFor(sc, views);
    if (!picker || sc.gameOver?.autoPickAt == null) {
      this.popupKeys.delete(sc.id);
      return null;
    }
    // Keep the pop-up stable (no redraw under your mouse): the page counts down on its own, and
    // "ms left" is only recomputed when the list or the deadline changes.
    const key = JSON.stringify(picker) + sc.gameOver.autoPickAt;
    const prev = this.popupKeys.get(sc.id);
    if (prev?.key === key) return { ...picker, autoPickInMs: prev.ms };
    const ms = Math.max(0, Math.round((sc.gameOver.autoPickAt - now) / (this.opts.replay?.speed ?? 1)));
    this.popupKeys.set(sc.id, { key, ms });
    return { ...picker, autoPickInMs: ms };
  }

  private state(): AppState {
    const views = this.engine.views();
    const c = this.cfg;
    return {
      now: this.clock.now(),
      mode: this.mode,
      shell: this.opts.shell,
      setup: this.setupRunner?.view() ?? null,
      providers: listProviders(),
      service: this.serviceDTO(),
      diag: this.diagDTO(),
      provider: { id: this.adapter.config.id, name: this.adapter.config.name, shortName: this.adapter.config.shortName, status: this.adapter.config.status },
      signin: this.signin,
      streamLimit: this.controller?.streamLimit ?? c.windows.maxConcurrentStreams,
      audio: { mode: this.engine.audio.mode, focus: this.engine.audio.focus },
      view: { fullscreen: this.fullscreen },
      tickerExtra: [...this.tickerExtra.values()].flat().map((g) => gameDTO(g, undefined, this.engine.channelFor(g), null)),
      feed: this.feed.slice(-80),
      labels: this.labels,
      settings: {
        sensitivity: c.switching.sensitivity,
        breakModel: c.switching.breakModel,
        dwellSeconds: c.director.dwellSeconds,
        minSubstituteSeconds: c.switching.minSubstituteSeconds,
        scoreboardLiveSeconds: c.espn.scoreboardLiveSeconds,
        summarySeconds: c.espn.summarySeconds,
        hotSummarySeconds: c.espn.hotSummarySeconds,
        allowDuplicates: c.director.allowDuplicates,
        gameOverAutoPickSeconds: c.director.gameOverAutoPickSeconds,
        enterThreshold: c.breakDetector.enterThreshold,
        youtube: this.highlights.youtubeEnabled,
        ticker: c.ticker,
        overridden: Object.keys(this.overrides),
      },
      screens: this.engine.director.screens.map((s) => {
        const r = this.controller?.renderOf(s.id) ?? { render: 'none' as const, reason: null };
        const h = this.controller?.screens[s.id - 1]?.lastHealth;
        return {
          id: s.id,
          sport: (s.homeGameId ? views.get(s.homeGameId)?.game.sport : null) ?? this.screenSports()[s.id - 1] ?? null,
          mode: s.mode,
          homeGameId: s.homeGameId,
          showingGameId: s.showing.kind === 'game' ? s.showing.gameId : null,
          showingKind: s.showing.kind,
          render: r.render,
          dataReason: r.reason,
          health: h ? { state: h.state, detail: h.detail } : null,
          error: this.controller?.failureOf(s.id) ?? null,
          gameOverAutoPickAt: s.gameOver?.autoPickAt ?? null,
          picker: this.pickerFor(s, views),
          audio: s.id === this.engine.audio.focus,
          switching: this.controller?.switchingOf(s.id) ?? null,
          lastSwitch: this.lastSwitch.get(s.id) ?? null,
        };
      }),
      games: [...views.values()].map((v) => {
        const a = resolveChannel(this.cfg, channelNetworks(this.cfg, v.game));
        return gameDTO(v.game, v.assessment, v.channel, a.available ? null : a.reason);
      }),
      sports: SPORTS.map((m) => {
        const games = [...views.values()].filter((v) => v.game.sport === m.id);
        return {
          id: m.id,
          name: m.name,
          short: m.short,
          family: m.family,
          level: m.level,
          games: games.length,
          live: games.filter((v) => v.game.phase === 'LIVE' || v.game.phase === 'HALFTIME').length,
          enabled: c.sports.enabled.includes(m.id),
          sensitivity: c.sports.overrides[m.id]?.sensitivity ?? null,
        };
      }),
    };
  }

  private async runReplay(r: NonNullable<AppOptions['replay']>): Promise<void> {
    const dir = recordingDir(DATA_ROOT, r.date);
    const feed = r.synth ? synthFeed(dir, this.cfg) : recordedFeed(dir);
    const warmFrom = r.fromMs - 15 * 60_000;
    const tickMs = this.cfg.director.tickSeconds * 1000;
    let warmTick: number | null = null;
    let started = false;
    this.clock.start(r.fromMs);
    for await (const item of feed) {
      if (this.stopped) return;
      if (item.at < warmFrom) continue;
      if (item.at < r.fromMs) {
        // Warm-up: build game history and detector state before the replay window, silently.
        while (warmTick !== null && warmTick <= item.at) {
          this.engine.tick(warmTick);
          warmTick += tickMs;
        }
        item.apply(this.ingest);
        warmTick ??= item.at;
        continue;
      }
      // A recording that starts after --from: begin at its first record, not hours of "No games today".
      if (!started && item.at > r.fromMs) r = { ...r, fromMs: item.at };
      if (!started) {
        started = true;
        this.clock.start(r.fromMs);
        this.info(`replaying ${r.date} from ${fmtClock(r.fromMs)} ET at ${r.speed}x`);
        this.replay = 'playing';
        this.startTicking();
      }
      const wait = (item.at - this.clock.now()) / r.speed;
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      item.apply(this.ingest);
    }
    this.info('replay finished');
  }
}

/** Sign in when the window opens only for live video: setup has its own sign-in step, and dry run and replay show data tiles. */
export function startupSignin(mode: AppState['mode'], inSetup: boolean): 'now' | 'defer' {
  return mode === 'live' && !inSetup ? 'now' : 'defer';
}

/** Config file + settings changed in the app, with the provider's scanned lineup (if any) as the channels. */
function resolveConfig(file: Config, overrides: SettingsOverrides): Config {
  const c = withOverrides(file, overrides);
  return { ...c, channels: effectiveChannels(c, c.provider, STATE_DIR) };
}

function appVersion(): string {
  try {
    return JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
