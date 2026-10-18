import type { Sensitivity } from '../config';
import type { GameState, LastPlay, TimelineEvent } from '../engine/gameStore';
import type { RankedCandidate } from '../engine/ranker';
import type { GameSnapshot, LiveDetail, Phase, PlayKind, PlaySnap, Situation, SportFamily, SportId, TeamSnap } from '../engine/types';
import type { Json } from '../espn/json';
import type { SynthAdapter } from './synth/types';

// One sport at one level (college football, NFL, NBA, NHL, …). Everything that differs between
// sports lives behind this interface; the engine, director and UI only see the common model.
// Modules are pure: no I/O, no clock, so live, replay and tests all run the same code.

export interface CategorizablePlay {
  kind: PlayKind;
  typeText: string;
  text: string;
  period: number | null;
  isTurnover?: boolean;
}

/** How a sport's stoppages turn into the break forecast (src/engine/forecast.ts). */
export interface BreakSpec {
  /** Stoppage categories in the model file, in display order. */
  categories: readonly string[];
  labels: Record<string, string>;
  /** Category of the stoppage that follows `p`; null when it doesn't start a forecastable break (e.g. end of half). */
  categorize(p: CategorizablePlay, prev?: { kind: PlayKind } | null): string | null;
  /** Play kinds that mean the ball (puck…) is live again: they end a break. */
  resumes: ReadonlySet<PlayKind>;
  /** A new play that continues the current break instead of ending it (football: TD → PAT → kickoff). */
  continues?(play: { kind: PlayKind }, triggerCategory: string): string | null;
  /** Categories that first play out on screen for lingerSeconds (scores). */
  linger: ReadonlySet<string>;
  /** Plays that don't change what stoppage the game is in (basketball substitutions during a timeout). */
  ignore?(p: { kind: PlayKind; typeText: string }): boolean;
  /** Default model file, relative to the project root. */
  modelFile: string;
}

export interface SportPreset {
  /** Only switch when the break is predicted to have at least this long left for you… */
  minBreakSeconds: number;
  /** …with at least this probability. */
  confidence: number;
  /** Replace a substitute that goes to break only if home still has this much break predicted. */
  replaceIfHomeRemainingSeconds: number;
  /** Move a running fill-in to a same-sport game that reaches a hot moment (red zone, power play…). */
  upgradeToHot: boolean;
  /** Stoppage categories that never start a break at this sensitivity (MLB at Low: half-innings). */
  excludeCategories: string[];
}

export interface HotMoment {
  /** Short label: "red zone", "power play", "clutch". */
  label: string;
  /** Completes "<game> …": "is in the red zone", "is on a power play". */
  phrase: string;
}

export interface Excitement {
  /** 0–100, comparable across sports. */
  score: number;
  hot: HotMoment | null;
  /** Why it's worth watching, e.g. "red zone, margin 3, 2:10 - 4th". */
  why: string;
}

/** What a sport's scoreboard inference may do to a game's timeline (src/engine/gameStore.ts). */
export interface InferContext {
  /** Estimated real time of what this poll shows. */
  est: number;
  now: number;
  /** Next synthetic ordering number (scoreboard events have no play sequence). */
  order(): number;
  push(e: TimelineEvent): void;
  /** Add unless play-by-play already has the same event. */
  pushInferred(e: TimelineEvent): void;
  setLastPlay(p: Omit<LastPlay, 'prevKind'>): void;
}

export interface SportModule {
  id: SportId;
  /** "College Football", "NBA", "Men's College Basketball". */
  name: string;
  /** Header/badge label: "CFB", "NBA", "MCBB". */
  short: string;
  level: 'pro' | 'college';
  family: SportFamily;
  espn: { path: string; groups?: string };

  // ---- parsing ESPN JSON into the common model ----------------------------------------------
  phaseOf(statusName: string, state: string | null, detail: string, period: number | null): Phase;
  /** Between periods while ESPN still says in progress ("End of 3rd"). */
  endOfPeriod(phase: Phase, statusName: string, detail: string): boolean;
  situationOf(comp: Json, home: TeamSnap, away: TeamSnap): { situation: Situation | null; live: LiveDetail | null };
  /** Every play in a summary, deduped and in game order. */
  summaryPlays(body: Json): PlaySnap[];
  classifyPlay(typeText: string, scoringPlay: boolean, scoreValue: number): PlayKind;
  /** Timeline events a scoreboard poll implies (quarter breaks, timeouts…) for a game seen for the first time. */
  inferFirstSeen?(g: GameState, snap: GameSnapshot, ctx: InferContext): void;
  /** …and when a new poll differs from the previous one. */
  inferChange?(g: GameState, prev: GameSnapshot, snap: GameSnapshot, ctx: InferContext): void;

  // ---- breaks ------------------------------------------------------------------------------
  breaks: BreakSpec;
  presets: Record<Sensitivity, SportPreset>;
  /** Longest halftime/intermission before the reel gives up and goes back to the game. */
  halftimeMaxSeconds?: number;

  // ---- excitement --------------------------------------------------------------------------
  /** Game time elapsed in seconds (bigger = later), for ordering and logs. */
  progressSeconds(g: GameSnapshot): number;
  excitement(g: GameSnapshot): Excitement;
  /** Order of two same-sport fill-in candidates (best first). */
  compare(a: RankedCandidate, b: RankedCandidate): number;

  // ---- simulation ---------------------------------------------------------------------------
  /** Rebuilds this sport's games from final play-by-play (`npm run sim -- --synth`). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  synth?: SynthAdapter<any>;
}
