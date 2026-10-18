import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { Config } from '../config';
import type { Command } from '../engine/director';
import { gridBounds, markerUrl, openWindow, setWindowBounds, workArea } from './chrome';
import { ERROR_STATES, type StreamState } from './health';
import { adviseOnStream, allocateVideo } from './policy';
import { channelRef } from '../providers/lineup';
import type { ChannelRef, ProviderAdapter, TuneTools } from '../providers/types';
import { ScreenWindow, type BridgeMessage, type OverlayState, type Popup } from './screen';
import type { SwitchTiming } from './timing';
import { Tuner } from './tuner';

// Turns director commands into what the four Chrome windows show, and watches the streams.
//  - Each screen applies only its latest wanted state (a new command supersedes one in progress).
//  - Stream problems: one quick retry, then a red error card + the director is told (it stops
//    auto-switching that screen) and the screen keeps retrying every errorRetrySeconds.
//  - If the service reports a stream limit, the controller lowers its limit and the least exciting
//    screens show a live data tile instead of video.

export type Want = { kind: 'game'; gameId: string; channel: number; channelName: string } | { kind: 'halftime' } | { kind: 'none' };

export interface ControllerEvents {
  tuned(screen: number, info: { gameId: string; channelName: string; channel: number; path: string; ms: number }): void;
  streamProblem(screen: number, info: { state: StreamState; detail: string; title: string; hint: string }): void;
  streamRecovered(screen: number): void;
  limitLearned(limit: number, detail: string): void;
  info(text: string): void;
  /** A hotkey or pop-up click in a tile (screen 1-4) or in the control panel (screen 0). */
  bridge(screen: number, msg: BridgeMessage): void;
  /** Full timeline of one channel change, once the new video plays (or the watch gives up). */
  switchTiming(timing: SwitchTiming): void;
}

export interface ControllerOptions {
  dryRun: boolean;
  serverUrl: string;
  /** Remembers the tile windows' target ids so a restart reuses them. */
  stateFile: string;
  /** Remembered live URLs per channel (per provider: see cacheFileFor). */
  cacheFile: string;
  /** The TV service the screens play. */
  adapter: ProviderAdapter;
}

interface Failure {
  state: StreamState;
  attempts: number;
  failed: boolean;
  retryAt: number | null;
}

export class WindowController {
  readonly screens: ScreenWindow[] = [];
  private readonly tuner: Tuner;
  private wants = new Map<number, Want>();
  /**
   * Screens between a channel command and the new video playing. The UI shows a "Switching to…" card,
   * or just a small "loading" note when the new game loads in a standby view behind the current picture.
   */
  private switching = new Map<number, { gameId: string; channelName: string; since: number; background: boolean }>();
  // One-window app standby views: a screen's own game keeps playing (muted, hidden) in `parked` while a
  // substitute is on, so going back is a swap; free views wait in `spares` on the service's guide.
  private presenter: ((screen: number, view: string) => void) | null = null;
  private spares: ScreenWindow[] = [];
  private parked = new Map<number, ScreenWindow>();
  private homeChannels = new Map<number, number | null>();
  private standby = true;
  private applied = new Map<number, string>();
  private running = new Set<number>();
  private failures = new Map<number, Failure>();
  private errorCards = new Map<number, OverlayState['error']>();
  private badges = new Map<number, OverlayState['badge']>();
  private popups = new Map<number, Popup | null>();
  private panel: Page | null = null;
  /** When each screen's latest tune command arrived, and a counter to spot superseded tunes. */
  private commandedAt = new Map<number, number>();
  private tuneGeneration = new Map<number, number>();
  private excitement = new Map<number, number>();
  private driftFixedAt = new Map<number, number>();
  private videoAllowed = new Set<number>();
  private limit: number;
  private focus = 1;

  constructor(
    private cfg: Config,
    private readonly browser: Browser,
    /** Chrome's default context (the Chrome shell opens its windows in it); null for the one-window app. */
    private readonly context: BrowserContext | null,
    private readonly opts: ControllerOptions,
    private readonly events: ControllerEvents,
  ) {
    this.tuner = new Tuner(opts.adapter, opts.cacheFile, { fastPath: cfg.windows.fastPath });
    this.limit = cfg.windows.maxConcurrentStreams;
  }

  get streamLimit(): number {
    return this.limit;
  }

  /** The tuner's page-load tools (first-run setup reads the guide with them). */
  get tools(): TuneTools {
    return this.tuner.tools;
  }

  setConfig(cfg: Config): void {
    this.cfg = cfg;
  }

  /** One-window app: drive the shell's video views (it lays them out and draws the UI itself). */
  async attach(views: { name: string; page: Page }[], spares: { name: string; page: Page }[] = [], present: ((screen: number, view: string) => void) | null = null): Promise<void> {
    for (const [i, v] of views.entries()) {
      const sw = new ScreenWindow(i + 1, v.page, this.tuner, this.cfg.windows, false, v.name);
      await sw.setMuted(i + 1 !== this.focus);
      this.screens.push(sw);
      this.videoAllowed.add(i + 1);
    }
    this.spares = spares.map((v) => new ScreenWindow(0, v.page, this.tuner, this.cfg.windows, false, v.name));
    this.presenter = present;
    this.standby = !!present && this.spares.length > 0 && !this.opts.dryRun;
    // Once the screens are up, put the standby views on the service's guide (no stream) so their first use is quick.
    if (this.standby) {
      setTimeout(() => {
        for (const s of this.spares) void this.tuner.warm(s.page).catch((e) => this.events.info(`standby view ${s.viewName} could not open the guide: ${String(e).split('\n')[0]}`));
      }, this.opts.adapter.config.timing.spareWarmDelayMs).unref();
    }
    this.events.info(`${views.length} video views attached${this.standby ? ` + ${this.spares.length} standby` : ''}${this.opts.dryRun ? `, dry run: data tiles instead of ${this.shortName}` : ''}`);
  }

  /** The channel of each screen's own game (the app updates it as homes change). */
  setHomeChannel(screen: number, channel: number | null): void {
    this.homeChannels.set(screen, channel);
  }

  switchingOf(screen: number): { gameId: string; channelName: string; since: number; background: boolean } | null {
    return this.switching.get(screen) ?? null;
  }

  /** Streams playing right now, counting parked standby views. */
  get streamsInUse(): number {
    return this.screens.filter((s) => s.render === 'video').length + [...this.parked.values()].filter((s) => s.render === 'video').length;
  }

  /** Re-apply every screen's channel (e.g. after the service was signed in again). */
  restoreAll(): void {
    for (const s of this.screens) this.restore(s.id);
  }

  /** Open (or reuse) the tile windows and the control panel, and lay the tiles out 2x2. */
  async open(count = 4): Promise<void> {
    if (!this.context) throw new Error('open() needs Chrome');
    const saved = this.loadTargets();
    const byTarget = new Map<string, Page>();
    for (const p of this.context.pages()) {
      const id = await targetIdOf(p).catch(() => null);
      if (id) byTarget.set(id, p);
    }
    const pages: Page[] = [];
    for (let i = 0; i < count; i++) {
      const reuse = saved.targets[i] ? byTarget.get(saved.targets[i]) : undefined;
      pages.push(reuse ?? (await openWindow(this.cfg, this.browser, this.context, `RedZone screen ${i + 1}`, this.cfg.windows.appMode)));
    }
    const area = await workArea(pages[0]);
    const tiles = gridBounds(area);
    for (const [i, p] of pages.entries()) {
      await setWindowBounds(p, tiles[i]);
      const sw = new ScreenWindow(i + 1, p, this.tuner, this.cfg.windows);
      await sw.installBridge((msg) => this.events.bridge(sw.id, msg));
      await sw.setMuted(i + 1 !== this.focus);
      this.screens.push(sw);
      this.videoAllowed.add(i + 1);
    }

    // Control panel: a 5th app window centred over the grid; Alt+P hides/shows it.
    this.panel = (saved.panel ? byTarget.get(saved.panel) : undefined) ?? (await openWindow(this.cfg, this.browser, this.context, 'RedZone panel', this.cfg.windows.appMode));
    await this.panel.exposeBinding('rzCall', (_s, msg: BridgeMessage) => this.events.bridge(0, msg)).catch(() => {});
    await this.panel.goto(`${this.opts.serverUrl}/panel`, { waitUntil: 'domcontentloaded' });
    const w = Math.min(1060, area.width - 60);
    const h = Math.min(680, area.height - 40);
    await setWindowBounds(this.panel, { left: area.left + Math.round((area.width - w) / 2), top: area.top + Math.round((area.height - h) / 2), width: w, height: h });

    this.saveTargets({ targets: await Promise.all(pages.map((p) => targetIdOf(p))), panel: await targetIdOf(this.panel) });
    this.events.info(`${count} tile windows + control panel ready (${tiles[0].width}x${tiles[0].height} tiles)${this.opts.dryRun ? `, dry run: data tiles instead of ${this.shortName}` : ''}. Alt+P shows/hides the panel.`);
  }

  /** Show or hide the control panel window (toggle when `show` is omitted). */
  async togglePanel(show?: boolean): Promise<void> {
    if (!this.panel) return;
    const cdp = await this.panel.context().newCDPSession(this.panel);
    try {
      const { windowId, bounds } = (await cdp.send('Browser.getWindowForTarget')) as { windowId: number; bounds: { windowState?: string } };
      const visible = bounds.windowState !== 'minimized';
      if (show ?? !visible) {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await this.panel.bringToFront();
      } else {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      }
    } finally {
      await cdp.detach().catch(() => {});
    }
  }

  /** Game-over pop-up for a screen (null hides it). Falls back to a local picker page if the player hides it. */
  setPopup(screen: number, popup: Popup | null): void {
    const before = this.popups.get(screen) ?? null;
    if (JSON.stringify(before) === JSON.stringify(popup)) return;
    this.popups.set(screen, popup);
    void this.redraw(screen).then(async () => {
      const sw = this.screens[screen - 1];
      if (popup && sw?.render === 'video' && !sw.popupVisible) {
        this.events.info(`S${screen} pop-up hidden by the player; showing the game picker page instead`);
        await sw.showLocal(`${this.opts.serverUrl}/picker/${screen}`).catch(() => {});
      }
      if (!popup && sw?.render === 'local' && sw.localUrl?.includes('/picker/')) this.restore(screen);
    });
  }

  /** Re-apply a screen's wanted channel (e.g. after leaving the picker page). */
  restore(screen: number): void {
    this.applied.delete(screen);
    void this.kick(screen);
  }

  execute(cmd: Command): void {
    if (cmd.type === 'tune') {
      this.commandedAt.set(cmd.screen, Date.now());
      this.want(cmd.screen, { kind: 'game', gameId: cmd.gameId, channel: cmd.channel, channelName: cmd.channelName });
    }
    else if (cmd.type === 'showHalftime') this.want(cmd.screen, { kind: 'halftime' });
    // showGameOver / hideGameOver are drawn by the app through the badge (pop-up comes in Phase 3).
  }

  wantOf(screen: number): Want | undefined {
    return this.wants.get(screen);
  }

  /** How a screen is rendering its current want. */
  renderOf(screen: number): { render: 'video' | 'data' | 'local' | 'none'; reason: string | null } {
    const want = this.wants.get(screen);
    if (!want || want.kind === 'none') return { render: 'none', reason: null };
    if (want.kind === 'halftime') return { render: 'local', reason: null };
    if (this.opts.dryRun) return { render: 'data', reason: 'dry run' };
    if (!this.videoAllowed.has(screen)) return { render: 'data', reason: `stream limit (${this.limit})` };
    return { render: 'video', reason: null };
  }

  failureOf(screen: number): { title: string; hint: string } | null {
    const card = this.errorCards.get(screen);
    return card ? { title: card.title, hint: card.hint } : null;
  }

  /** Excitement per screen (from the audio scorer) decides who keeps video under a stream limit. */
  setExcitement(scores: Map<number, number>): void {
    this.excitement = scores;
  }

  async setAudioFocus(screen: number): Promise<void> {
    this.focus = screen;
    await Promise.all([...this.screens.map((s) => s.setMuted(s.id !== screen)), ...[...this.parked.values()].map((s) => s.setMuted(true))]);
  }

  setBadge(screen: number, badge: OverlayState['badge']): void {
    if (JSON.stringify(this.badges.get(screen)) === JSON.stringify(badge)) return;
    this.badges.set(screen, badge);
    void this.redraw(screen);
  }

  /** Health checks, retries and stream-limit reallocation. Call every couple of seconds. */
  async tick(now = Date.now()): Promise<void> {
    if (this.opts.dryRun) return;
    this.reallocate();
    await Promise.all([...this.screens.map((sw) => this.checkScreen(sw, now)), ...[...this.parked.entries()].map(([screen, sw]) => this.checkParked(screen, sw))]);
  }

  /** A parked home stream that stopped playing (or isn't the screen's game any more) is let go. */
  private async checkParked(screen: number, sw: ScreenWindow): Promise<void> {
    if (this.running.has(screen)) return;
    if (sw.channel !== (this.homeChannels.get(screen) ?? null)) return this.unpark(screen, 'home game changed');
    const h = await sw.checkHealth().catch(() => null);
    if (h?.state === 'STREAM_LIMIT') this.disableStandby(h.detail);
    else if (h && ERROR_STATES.has(h.state)) this.unpark(screen, `${h.state}: ${h.detail}`);
  }

  private unpark(screen: number, why: string): void {
    const sw = this.parked.get(screen);
    if (!sw) return;
    this.parked.delete(screen);
    this.events.info(`S${screen} let go of its parked home stream (${why})`);
    this.releaseView(sw);
  }

  private disableStandby(detail: string): void {
    if (!this.standby) return;
    this.standby = false;
    this.events.info(`standby views off: ${this.shortName} reported a stream limit (${detail})`);
    for (const screen of [...this.parked.keys()]) this.unpark(screen, 'stream limit');
  }

  async close(): Promise<void> {
    await Promise.all(this.screens.map((s) => s.page.goto(markerUrl(`RedZone screen ${s.id} (stopped)`)).catch(() => {})));
  }

  // -------------------------------------------------------------------------------------------

  private want(screen: number, want: Want): void {
    this.wants.set(screen, want);
    this.failures.delete(screen);
    this.errorCards.delete(screen);
    void this.kick(screen);
  }

  private keyOf(screen: number, want: Want | undefined): string {
    if (!want) return 'none';
    const r = this.renderOf(screen);
    return want.kind === 'game' ? `${r.render}:${want.gameId}:${want.channel}` : want.kind;
  }

  private async kick(screen: number): Promise<void> {
    if (this.running.has(screen)) return; // the running loop picks up the newest want
    this.running.add(screen);
    let error: string | null = null;
    try {
      for (let guard = 0; guard < 5; guard++) {
        const want = this.wants.get(screen);
        const key = this.keyOf(screen, want);
        if (key === this.applied.get(screen)) break;
        await this.applyOnce(screen, want);
        this.applied.set(screen, key);
      }
    } catch (err) {
      error = String(err).split('\n')[0];
      this.applied.delete(screen);
    } finally {
      this.running.delete(screen);
    }
    if (error) {
      this.events.info(`S${screen} could not apply its channel: ${error}`);
      this.noteFailure(screen, 'UNKNOWN_ERROR', error, Date.now());
    }
  }

  private async applyOnce(screen: number, want: Want | undefined): Promise<void> {
    const sw = this.screens[screen - 1];
    const base = this.opts.serverUrl;
    const dataTile = this.renderOf(screen).render === 'data';
    if (!want || want.kind !== 'game' || dataTile) this.switching.delete(screen);
    if (!want || want.kind === 'none' || dataTile) this.unpark(screen, 'no game to go back to');
    if (!want || want.kind === 'none') return sw.showLocal(`${base}/idle/${screen}`);
    if (want.kind === 'halftime') {
      // With a free standby view the reel plays there and the game keeps playing underneath (muted),
      // so the 2nd half starts with an instant swap instead of a cold tune.
      if (this.standby && (await this.halftimeWithStandby(screen, sw))) return;
      this.unpark(screen, 'halftime');
      return sw.showLocal(`${base}/halftime/${screen}`);
    }
    if (this.renderOf(screen).render === 'data') return sw.showLocal(`${base}/tile/${screen}`);
    if (sw.render === 'video' && sw.channel === want.channel && sw.lastHealth?.state === 'PLAYING') {
      this.switching.delete(screen);
      return;
    }
    if (this.standby && (await this.applyWithStandby(screen, sw, want))) return;
    const gen = (this.tuneGeneration.get(screen) ?? 0) + 1;
    this.tuneGeneration.set(screen, gen);
    this.switching.set(screen, { gameId: want.gameId, channelName: want.channelName, since: this.commandedAt.get(screen) ?? Date.now(), background: false });
    const timing: SwitchTiming = {
      screen,
      gameId: want.gameId,
      channel: want.channel,
      channelName: want.channelName,
      path: null,
      commandedAt: this.commandedAt.get(screen) ?? Date.now(),
      navStartAt: Date.now(),
      navCommittedAt: null,
      firstFrameAt: null,
      playingAt: null,
      outcome: 'error',
    };
    const beforeSrc = sw.render === 'video' ? await sw.currentSrc() : null;
    let out;
    try {
      out = await sw.tuneChannel(this.refOf(want));
    } catch (err) {
      this.switching.delete(screen);
      this.events.switchTiming(timing);
      throw err;
    }
    timing.path = out.path;
    timing.navCommittedAt = Date.now();
    await sw.setMuted(screen !== this.focus);
    this.events.tuned(screen, { gameId: want.gameId, channelName: want.channelName, channel: want.channel, path: out.path, ms: out.ms });
    await this.redraw(screen);
    // Watch the new stream start in the background (doesn't hold up the next command).
    void sw.watchStart(beforeSrc, this.cfg.windows.startupTimeoutSeconds * 1000, () => this.tuneGeneration.get(screen) === gen).then((r) => {
      if (this.tuneGeneration.get(screen) === gen) this.switching.delete(screen);
      this.events.switchTiming({ ...timing, ...r });
    });
  }

  /**
   * Standby views. Returns true when the switch was done that way:
   *  1. back to the screen's own game while it's still playing underneath: swap it to the front (instant);
   *  2. leaving the screen's own game for a substitute: load it in a free view while the game keeps
   *     playing on screen, cut over once it plays, and keep the game playing underneath.
   */
  private async applyWithStandby(screen: number, front: ScreenWindow, want: Extract<Want, { kind: 'game' }>): Promise<boolean> {
    const home = this.homeChannels.get(screen) ?? null;
    const parked = this.parked.get(screen);
    const commandedAt = this.commandedAt.get(screen) ?? Date.now();
    const gen = (this.tuneGeneration.get(screen) ?? 0) + 1;
    const timing: SwitchTiming = { screen, gameId: want.gameId, channel: want.channel, channelName: want.channelName, path: null, commandedAt, navStartAt: Date.now(), navCommittedAt: null, firstFrameAt: null, playingAt: null, outcome: 'error' };

    if (parked && parked.channel === want.channel && parked.render === 'video') {
      this.tuneGeneration.set(screen, gen);
      this.parked.delete(screen);
      this.bringToFront(screen, parked, front);
      this.switching.delete(screen);
      const at = Date.now();
      this.events.tuned(screen, { gameId: want.gameId, channelName: want.channelName, channel: want.channel, path: 'standby swap', ms: at - commandedAt });
      this.events.switchTiming({ ...timing, path: 'standby swap', navStartAt: at, navCommittedAt: at, firstFrameAt: at, playingAt: at, outcome: 'playing' });
      this.releaseView(front);
      return true;
    }

    const leavingHome = !parked && home !== null && want.channel !== home && front.render === 'video' && front.channel === home && front.lastHealth?.state === 'PLAYING';
    if (!leavingHome || !this.spares.length) return false;
    const spare = this.takeSpare();
    spare.id = screen;
    this.tuneGeneration.set(screen, gen);
    this.switching.set(screen, { gameId: want.gameId, channelName: want.channelName, since: commandedAt, background: true });
    try {
      const out = await spare.tuneChannel(this.refOf(want));
      timing.path = `standby ${out.path}`;
      timing.navCommittedAt = Date.now();
      await spare.setMuted(true);
      const r = await spare.watchStart(null, this.cfg.windows.startupTimeoutSeconds * 1000, () => this.tuneGeneration.get(screen) === gen);
      if (r.outcome !== 'playing') {
        this.events.switchTiming({ ...timing, ...r });
        throw new Error(r.outcome === 'superseded' ? 'superseded' : 'the standby view did not start playing');
      }
      this.bringToFront(screen, spare, front);
      this.parked.set(screen, front);
      this.switching.delete(screen);
      const at = Date.now();
      this.events.tuned(screen, { gameId: want.gameId, channelName: want.channelName, channel: want.channel, path: timing.path, ms: at - commandedAt });
      this.events.switchTiming({ ...timing, firstFrameAt: r.firstFrameAt, playingAt: at, outcome: 'playing' });
      return true;
    } catch (err) {
      this.releaseView(spare);
      if (this.switching.get(screen)?.background) this.switching.delete(screen);
      if (String(err).includes('superseded')) return true; // the newest command takes over (kick loop)
      this.events.info(`S${screen} standby load failed (${String(err).split('\n')[0]}); switching in place`);
      return false;
    }
  }

  private async halftimeWithStandby(screen: number, front: ScreenWindow): Promise<boolean> {
    const home = this.homeChannels.get(screen) ?? null;
    if (this.parked.has(screen) || !this.spares.length || front.render !== 'video' || front.channel !== home) return false;
    const spare = this.takeSpare();
    spare.id = screen;
    try {
      await spare.showLocal(`${this.opts.serverUrl}/halftime/${screen}`);
    } catch {
      this.releaseView(spare);
      return false;
    }
    this.bringToFront(screen, spare, front);
    this.parked.set(screen, front);
    this.events.info(`S${screen} halftime reel in standby view ${spare.viewName}; the game keeps playing underneath for the 2nd half`);
    return true;
  }

  /** A free standby view, preferring one already on the service's guide (its channel change is an in-app click). */
  private takeSpare(): ScreenWindow {
    const i = this.spares.findIndex((s) => this.opts.adapter.isWarm(s.page));
    return this.spares.splice(i >= 0 ? i : 0, 1)[0];
  }

  /** Free a view: stop its stream, put it back on the service's guide, and make it available again. */
  private releaseView(sw: ScreenWindow): void {
    sw.id = 0;
    void sw
      .release()
      .then(() => this.tuner.warm(sw.page))
      .catch(() => {})
      .finally(() => this.spares.push(sw));
  }

  /** Show `next` in the screen's cell; `prev` stays underneath (parked) or is released by the caller. */
  private bringToFront(screen: number, next: ScreenWindow, prev: ScreenWindow): void {
    next.id = screen;
    this.screens[screen - 1] = next;
    this.presenter?.(screen, next.viewName!);
    void next.setMuted(screen !== this.focus);
    void prev.setMuted(true);
    // Its health checks paused while the swap was prepared; start the stall clock fresh.
    prev.tracker.reset();
    prev.lastHealth = null;
  }

  private get shortName(): string {
    return this.opts.adapter.config.shortName;
  }

  /** The lineup entry for a wanted channel (a channel missing from the lineup still tunes by number). */
  private refOf(want: { channel: number; channelName: string }): ChannelRef {
    return channelRef(this.cfg.channels, want.channel) ?? { name: want.channelName, number: want.channel, callSign: null, ref: null };
  }

  private async checkScreen(sw: ScreenWindow, now: number): Promise<void> {
    if (this.running.has(sw.id)) return;
    // The page moved itself to another channel (Xfinity pages loading together can follow each other).
    const url = sw.page.url();
    if (sw.render === 'video' && sw.ref && this.opts.adapter.isOnPlayer(url) && !this.opts.adapter.onChannel(url, sw.ref)) {
      const last = this.driftFixedAt.get(sw.id) ?? 0;
      if (now - last > 20_000) {
        this.driftFixedAt.set(sw.id, now);
        this.events.info(`S${sw.id} drifted to ${url.split('/').pop()} instead of ${sw.ref.callSign ?? sw.ref.ref ?? sw.ref.name}; tuning it back`);
        sw.lastHealth = null;
        this.restore(sw.id);
        return;
      }
    }
    const f = this.failures.get(sw.id);
    // A screen that failed before any video loaded (e.g. the guide wouldn't load) still retries.
    if (f?.failed && f.retryAt !== null && now >= f.retryAt && sw.render !== 'video') return this.retry(sw, now);
    if (sw.render !== 'video') return;
    const h = await sw.checkHealth().catch(() => null);
    if (!h) return;
    if (h.state === 'PLAYING') {
      if (f?.failed) this.events.streamRecovered(sw.id);
      if (f) {
        this.failures.delete(sw.id);
        this.errorCards.delete(sw.id);
        await this.redraw(sw.id);
      }
      return;
    }
    if (h.state === 'IDLE_PROMPT') return this.events.info(`S${sw.id} answered ${this.shortName}'s "Are you still watching?" prompt`);
    if (f?.failed && f.retryAt !== null && now >= f.retryAt) return this.retry(sw, now);
    if (!f?.failed) this.noteFailure(sw.id, h.state, h.detail, now);
  }

  private noteFailure(screen: number, state: StreamState, detail: string, now: number): void {
    const f: Failure = this.failures.get(screen) ?? { state, attempts: 0, failed: false, retryAt: null };
    f.state = state;
    const advice = adviseOnStream(state, f.attempts, this.cfg.windows.errorRetrySeconds, this.shortName);
    if (advice.action === 'none') return;
    this.failures.set(screen, f);
    const sw = this.screens[screen - 1];
    if (advice.action === 'dataTile') {
      const playing = this.screens.filter((s) => s.id !== screen && s.render === 'video' && s.lastHealth?.state === 'PLAYING').length;
      this.limit = Math.max(1, Math.min(this.limit, playing));
      this.events.limitLearned(this.limit, detail);
      this.failures.delete(screen);
      this.reallocate(true);
      return;
    }
    if (advice.action === 'retry') {
      this.events.info(`S${screen} ${state}: ${detail}; retrying once`);
      void this.retry(sw, now);
      return;
    }
    f.failed = true;
    f.retryAt = advice.retryAfterSeconds !== null ? now + advice.retryAfterSeconds * 1000 : null;
    this.errorCards.set(screen, { title: advice.title, detail, hint: advice.hint });
    this.events.streamProblem(screen, { state, detail, title: advice.title, hint: advice.hint });
    void this.redraw(screen);
  }

  private async retry(sw: ScreenWindow, now: number): Promise<void> {
    const f = this.failures.get(sw.id);
    if (f) {
      f.attempts++;
      if (f.failed) f.retryAt = now + this.cfg.windows.errorRetrySeconds * 1000;
    }
    if (sw.channel !== null && sw.lastTune?.path === 'cached-url') this.tuner.forget(sw.channel);
    this.applied.delete(sw.id);
    sw.lastHealth = null;
    await this.kick(sw.id);
  }

  private reallocate(force = false): void {
    if (this.limit >= this.screens.length && !force) return;
    const next = allocateVideo(
      this.screens.map((s) => ({ id: s.id, wantsVideo: this.wants.get(s.id)?.kind === 'game', excitement: this.excitement.get(s.id) ?? 0 })),
      this.limit,
      this.videoAllowed,
    );
    for (const s of this.screens) if (!this.wants.has(s.id) || this.wants.get(s.id)?.kind !== 'game') next.add(s.id);
    const changed = this.screens.filter((s) => next.has(s.id) !== this.videoAllowed.has(s.id));
    this.videoAllowed = next;
    for (const s of changed) void this.kick(s.id);
  }

  private async redraw(screen: number): Promise<void> {
    const sw = this.screens[screen - 1];
    if (!sw) return;
    await sw.setOverlay({
      badge: this.cfg.windows.badge ? (this.badges.get(screen) ?? null) : null,
      error: this.errorCards.get(screen) ?? null,
      popup: this.popups.get(screen) ?? null,
    });
  }

  private loadTargets(): { targets: string[]; panel?: string } {
    try {
      const s = JSON.parse(readFileSync(this.opts.stateFile, 'utf8'));
      return { targets: s.targets ?? [], panel: s.panel };
    } catch {
      return { targets: [] };
    }
  }

  private saveTargets(s: { targets: string[]; panel: string }): void {
    mkdirSync(path.dirname(this.opts.stateFile), { recursive: true });
    writeFileSync(this.opts.stateFile, JSON.stringify(s, null, 2));
  }
}

async function targetIdOf(page: Page): Promise<string> {
  const s = await page.context().newCDPSession(page);
  const { targetInfo } = (await s.send('Target.getTargetInfo')) as { targetInfo: { targetId: string } };
  await s.detach();
  return targetInfo.targetId;
}
