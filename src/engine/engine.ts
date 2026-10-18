import path from 'node:path';
import { resolveChannel } from '../channels';
import { directorSettings, PROJECT_ROOT, sportPreset, type Config } from '../config';
import { normalizeScoreboard } from '../espn/normalize';
import { sportOf } from '../sports';
import { audioStep, createAudio, setAudioFocus, setAudioMode, type AudioDecision, type AudioState } from './audio';
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

  ingestScoreboard(body: unknown, now: number, sport: SportId = 'cfb'): GameSnapshot[] {
    const snaps = normalizeScoreboard(body, now, sport);
    this.store.ingestSnapshots(snaps, now);
    return snaps;
  }

  ingestSnapshots(snaps: GameSnapshot[], now: number): void {
    this.store.ingestSnapshots(snaps, now);
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
    const key = g.networks.join('|');
    if (!this.channelCache.has(key)) {
      const a = resolveChannel(this.cfg, g.networks);
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
      if (a) out.set(g.id, { game: g.snap, assessment: a, channel: this.channelFor(g.snap) });
    }
    return out;
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
    return (g, mem, now) => assessForecast(g, mem, now, opts);
  }

  /** Run the detector for every game, then the director and audio. Call every tickSeconds. */
  tick(now: number): TickResult {
    const res = empty();
    const relevant = this.relevantGameIds();
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
    const step = applyAction(this.director, action, this.views(), now);
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
