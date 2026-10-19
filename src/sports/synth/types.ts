import type { GameSnapshot, PlaySnap, SportId, TeamSnap } from '../../engine/types';
import type { Json } from '../../espn/json';

// Rebuilding a game day from finished games' play-by-play, per sport family (src/espn/synth.ts runs
// the day; these turn one game's plays into what its scoreboard would have shown at a moment).

export interface SynthGame {
  id: string;
  sport: SportId;
  shortName: string;
  name: string;
  /** Scheduled start, ms. */
  start: number;
  home: TeamSnap;
  away: TeamSnap;
  networks: string[];
  /** Plays with a wallclock, in time order. */
  plays: PlaySnap[];
  finalDetail: string;
}

export interface SynthAdapter<G extends SynthGame = SynthGame> {
  /** One final summary → the game, or null when it has no timed plays. */
  prepare(body: Json, sport: SportId): G | null;
  /** The scoreboard at time t, when the first `visible` plays have been published. */
  snapshot(g: G, visible: number, t: number, delayMs: number): GameSnapshot;
}
