import path from 'node:path';
import { resolveChannel } from '../channels';
import { directorSettings, PROJECT_ROOT, sportPreset, type Config } from '../config';
import { normalizeScoreboard } from '../espn/normalize';
import { sportOf } from '../sports';
import { marketTeams } from '../sports/markets';
import { regionalStatus } from '../sports/nfl';
import { tennisChannelStatus } from '../sports/tennis';
import { audioStep, createAudio, holdAudio, releaseAudio, setAudioFocus, setAudioMode, type AudioDecision, type AudioState } from './audio';
import { assess, type DetectorMemory } from './breakDetector';
import { applyAction, createDirector, directorStep, type Command, type Decision, type DirectorState, type UserAction } from './director';
import { loadBreakModel } from './forecast';
import { assessForecast, type ForecastDetectorOptions } from './forecastDetector';
import { GameStore, type GameState } from './gameStore';
import { rankCandidates, type GameView } from './ranker';
import type { Assessment, BreakState, GameSnapshot, PlaySnap, SportId } from './types';

// Wires the pieces together. Deterministic given its inputs and the `now` you pass in, so the live
// app, replay/simulation and tests all drive the exact same logic.

export interface AssessmentChange {
  at: number;
  gameId: string;
  game: string;
  from: BreakState | null;
  to: BreakState;
  score: number;
  reasons: string[];
  /** Game is a home game or on screen right now. */
  relevant: boolean;
}

export interface TickResult {
  commands: Command[];
  decisions: Decision[];
  assessments: AssessmentChange[];
  audio: AudioDecision[];
}

const empty = (): TickResult => ({ commands: [], decisions: [], assessments: [], audio: [] });

type Detect = (g: GameState, mem: DetectorMemory | undefined, now: number) => { assessment: Assessment; memory: DetectorMemory };

export class Engine {
  readonly store: GameStore;
  director: DirectorState;
  audio: AudioState;
  private memory = new Map<string, DetectorMemory>();
  private assessments = new Map<string, Assessment>();
  private channelCache = new Map<string, GameView['channel']>();
  private programTitles: ReadonlyMap<string, string> = new Map();
  /** Tennis courts, as of the last tick: which matches a channel is known to show, and which share one. */
  private tennis: ReturnType<typeof tennisChannelStatus> = { status: new Map(), shared: new Set() };

  constructor(
    private cfg: Config,
    screenCount = 4,
  ) {
    this.store = new GameStore({ dataDelaySeconds: cfg.breakDetector.dataDelaySeconds });
    this.director = createDirector(screenCount);
    this.audio = createAudio(cfg.audio);
  }

  get config(): Config {
    return this.cfg;
  }

  /** Change the number of screens. Screens that remain keep their state; new ones start idle. */
  resizeScreens(n: number): void {
    const fresh = createDirector(n);
    this.director = { ...this.director, screens: fresh.screens.map((s) => this.director.screens.find((o) => o.id === s.id) ?? s) };
  }

  /** Hot reload: thresholds apply from the next tick. Audio mode set at runtime is kept. */
  setConfig(cfg: Config): void {
    this.cfg = cfg;
    this.channelCache.clear();
    this.store.setOptions({ dataDelaySeconds: cfg.breakDetector.dataDelaySeconds });
  }

  /** Sports you don't follow are ignored (live polling skips them; replays and sims may still contain them). */
  ingestScoreboard(body: unknown, now: number, sport: SportId = 'cfb'): GameSnapshot[] {
    if (!this.cfg.sports.enabled.includes(sport)) return [];
    const snaps = normalizeScoreboard(body, now, sport);
    this.store.ingestSnapshots(snaps, now);
    return snaps;
  }

  ingestSnapshots(snaps: GameSnapshot[], now: number): void {
    this.store.ingestSnapshots(snaps.filter((g) => this.cfg.sports.enabled.includes(g.sport)), now);
  }

  ingestSummary(gameId: string, body: unknown, now: number): void {
    const g = this.store.get(gameId);
    if (!g) return;
    this.store.ingestPlays(gameId, sportOf(g.snap.sport).summaryPlays(body), now);
  }

  ingestPlays(gameId: string, plays: PlaySnap[], now: number): void {
    this.store.ingestPlays(gameId, plays, now);
  }

  channelFor(g: GameSnapshot): GameView['channel'] {
    if (this.cfg.simulation.fullLineup) return this.channelFor0(g) ?? { name: `SIM ${g.shortName}`, number: 900_000 + (Number(g.id.replace(/\D/g, '').slice(-5)) || 0) };
    return this.channelFor0(g);
  }

  private channelFor0(g: GameSnapshot): GameView['channel'] {
    const networks = channelNetworks(this.cfg, g);
    const key = networks.join('|');
    if (!this.channelCache.has(key)) {
      const a = resolveChannel(this.cfg, networks);
      this.channelCache.set(key, a.available ? { name: a.channel, number: a.number } : null);
    }
    return this.channelCache.get(key)!;
  }

  assessment(gameId: string): Assessment | undefined {
    return this.assessments.get(gameId);
  }

  views(): Map<string, GameView> {
    const out = new Map<string, GameView>();
    for (const g of this.store.all()) {
      const a = this.assessments.get(g.id);
      // Hockey's power play comes from play-by-play: the scoreboard's situation has only the last play.
      // Play-by-play more than 2 minutes behind the scoreboard is no longer fetched: don't trust it.
      const fresh = g.playsLive && g.snap.phase === 'LIVE' && g.dataUpdatedAt - (g.playsLiveAt ?? 0) <= 120_000;
      const game = fresh ? { ...g.snap, live: g.playsLive! } : g.snap;
      if (a) out.set(g.id, { game, assessment: a, channel: this.channelFor(g.snap) });
    }
    // NFL Sunday windows: several games on CBS/FOX at once, and your station shows one.
    const nfl = [...out.values()].flatMap((v) => (v.game.sport === 'nfl' && v.channel ? [{ game: v.game, channel: v.channel.name }] : []));
    if (nfl.length > 1 && this.cfg.sports.nflRegionalCheck) {
      for (const [id, regional] of regionalStatus(nfl, marketTeams(this.cfg.sports.market, 'nfl'), this.programTitles)) {
        const v = out.get(id)!;
        v.channel = { ...v.channel!, regional };
      }
    }
    // Tennis: a channel shows one court at a time, and tour events list no network at all.
    for (const [id, regional] of this.tennis.status) {
      const v = out.get(id);
      if (v?.channel) v.channel = { ...v.channel, regional };
    }
    return out;
  }

  /** What the TV guide says is on a channel now (lineup key → program title), when the service's adapter can read it. */
  setProgramTitles(titles: ReadonlyMap<string, string>): void {
    this.programTitles = titles;
  }

  /**
   * The detector for one sport: its break forecast with its sensitivity preset, or (college football
   * with `switching.breakModel: "classic"`) the original weighted signals.
   */
  private detector(sport: SportId): Detect {
    const bd = this.cfg.breakDetector;
    const sw = this.cfg.switching;
    if (sport === 'cfb' && sw.breakModel === 'classic') {
      const det = { ...bd, staleDataSeconds: this.cfg.espn.staleDataSeconds };
      return (g, mem, now) => assess(g, mem, now, det);
    }
    const mod = sportOf(sport);
    const p = sportPreset(this.cfg, sport);
    const o = this.cfg.sports.overrides[sport];
    const opts: ForecastDetectorOptions = {
      model: loadBreakModel(path.resolve(PROJECT_ROOT, sport === 'cfb' ? sw.modelFile : mod.breaks.modelFile)),
      staleDataSeconds: this.cfg.espn.staleDataSeconds,
      streamDelaySeconds: o?.streamDelaySeconds ?? bd.streamDelaySeconds,
      dataDelaySeconds: o?.dataDelaySeconds ?? bd.dataDelaySeconds,
      lingerSeconds: bd.lingerSeconds,
      minBreakSeconds: p.minBreakSeconds,
      confidence: p.confidence,
      maxBreakSeconds: sw.maxBreakSeconds,
      breaks: mod.breaks,
      excludeCategories: p.excludeCategories,
    };
    const shared = mod.breaks.sharedChannelExclude;
    const sharedOpts: ForecastDetectorOptions | null = shared ? { ...opts, excludeCategories: [...(opts.excludeCategories ?? []), ...shared] } : null;
    return (g, mem, now) => assessForecast(g, mem, now, sharedOpts && this.tennis.shared.has(g.id) ? sharedOpts : opts);
  }

  /** Run the detector for every game, then the director and audio. Call every tickSeconds. */
  tick(now: number): TickResult {
    const res = empty();
    const relevant = this.relevantGameIds();
    // A session left running for days: finals off the scoreboard for 6 h (an earlier day's) are dropped.
    for (const g of this.store.all()) {
      if (g.snap.phase !== 'FINAL' || now - g.dataUpdatedAt < 6 * 3600_000 || relevant.has(g.id)) continue;
      this.store.delete(g.id);
      this.memory.delete(g.id);
      this.assessments.delete(g.id);
    }
    const snaps = this.store.all().map((g) => g.snap);
    this.tennis = snaps.some((g) => g.tennis) ? tennisChannelStatus(snaps.map((g) => ({ game: g, channel: this.channelFor(g)?.name ?? null })), this.programTitles) : { status: new Map(), shared: new Set() };
    const detectors = new Map<SportId, Detect>();
    for (const g of this.store.all()) {
      const prev = this.assessments.get(g.id);
      const sport = g.snap.sport;
      if (!detectors.has(sport)) detectors.set(sport, this.detector(sport));
      const { assessment, memory } = detectors.get(sport)!(g, this.memory.get(g.id), now);
      this.memory.set(g.id, memory);
      this.assessments.set(g.id, assessment);
      if (!prev || prev.state !== assessment.state) {
        res.assessments.push({ at: now, gameId: g.id, game: g.snap.shortName, from: prev?.state ?? null, to: assessment.state, score: assessment.score, reasons: assessment.reasons, relevant: relevant.has(g.id) });
      }
    }
    const views = this.views();
    const step = directorStep(this.director, views, now, directorSettings(this.cfg));
    this.director = step.state;
    res.commands.push(...step.commands);
    res.decisions.push(...step.decisions);
    const audio = audioStep(this.audio, this.director.screens, views, now, this.cfg.audio);
    this.audio = audio.state;
    if (audio.decision) res.audio.push(audio.decision);
    return res;
  }

  act(action: UserAction, now: number): TickResult {
    const res = empty();
    const step = applyAction(this.director, action, this.views(), now, this.cfg.director.allowDuplicates);
    this.director = step.state;
    res.commands.push(...step.commands);
    res.decisions.push(...step.decisions);
    return res;
  }

  focusAudio(screen: number, now: number): AudioDecision {
    const r = setAudioFocus(this.audio, screen, now, this.cfg.audio);
    this.audio = r.state;
    return r.decision;
  }

  setAudioMode(mode: 'manual' | 'auto'): void {
    this.audio = setAudioMode(this.audio, mode);
  }

  /** Per-screen fullscreen on (screen) or off (0): sound follows it, then goes back. */
  holdAudio(screen: number, now: number): AudioDecision | null {
    const r = screen > 0 ? holdAudio(this.audio, screen, now) : releaseAudio(this.audio, now);
    this.audio = r.state;
    return r.decision;
  }

  /** Home games and games on screen. */
  relevantGameIds(): Set<string> {
    const ids = new Set<string>();
    for (const sc of this.director.screens) {
      if (sc.homeGameId) ids.add(sc.homeGameId);
      if (sc.showing.kind === 'game') ids.add(sc.showing.gameId);
    }
    return ids;
  }

  /** Games worth fetching play-by-play for: relevant ones first, then the best fill-in candidates. */
  interestingGameIds(limit = this.cfg.espn.maxSummaryGames): string[] {
    const out = [...this.relevantGameIds()];
    const views = this.views();
    const { ranked } = rankCandidates(views.values(), { exclude: new Set(out), shownGames: new Set(), shownChannels: new Set() });
    for (const c of ranked) if (out.length < limit) out.push(c.view.game.id);
    // Live games on available channels that the ranker skipped (e.g. currently in a break).
    for (const v of views.values()) if (out.length < limit && v.channel && v.game.phase === 'LIVE' && !out.includes(v.game.id)) out.push(v.game.id);
    return out.slice(0, limit);
  }
}

/** The networks a game's channel is looked up by: tennis matches with none listed get the assumed one. */
export function channelNetworks(cfg: Config, g: GameSnapshot): string[] {
  return g.tennis && !g.networks.length && cfg.sports.tennis.assumedNetwork ? [cfg.sports.tennis.assumedNetwork] : g.networks;
}
