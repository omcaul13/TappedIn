// Shared engine types. Everything the decision engine sees is normalized into these shapes, so the
// engine never touches raw ESPN JSON (see src/espn/normalize.ts).

export type Phase = 'PRE' | 'LIVE' | 'HALFTIME' | 'FINAL' | 'DELAYED' | 'POSTPONED' | 'CANCELED' | 'UNKNOWN';

/** One sport at one level (src/sports/): NFL and college football are different sports here. */
export type SportId = 'cfb' | 'nfl' | 'mcbb' | 'nba' | 'nhl' | 'mlb' | 'wcbb' | 'wnba' | 'mls' | 'epl' | 'ucl' | 'laliga';
export type SportFamily = 'football' | 'basketball' | 'hockey' | 'baseball' | 'soccer';

export interface TeamSnap {
  id: string;
  abbr: string;
  name: string;
  score: number;
  /** ESPN team colors ("ba0c2f", no #) and logo URL, for the UI. */
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
}

export interface Situation {
  possessionTeamId: string | null;
  down: number | null;
  distance: number | null;
  /** Yards the offense needs to score (0–100), when known. */
  yardsToEndzone: number | null;
  downDistanceText: string | null;
  possessionText: string | null;
  isRedZone: boolean;
  /** Where isRedZone came from: ESPN's flag with a fresh down/distance, our own yard-line math, or unknown. */
  redZoneSource: 'espn' | 'derived' | 'none';
  homeTimeouts: number | null;
  awayTimeouts: number | null;
  lastPlay: { id: string; typeText: string; text: string; scoreValue: number } | null;
}

/** The scoreboard's "last play", which every sport's live situation carries. */
export interface ScoreboardLastPlay {
  id: string;
  typeText: string;
  text: string;
  scoreValue: number;
}

/** Live situation for sports other than football (football keeps its own `situation`). */
export type LiveDetail =
  | { family: 'basketball'; lastPlay: ScoreboardLastPlay | null; possessionTeamId: string | null; homeBonus: boolean | null; awayBonus: boolean | null }
  | {
      family: 'hockey';
      lastPlay: ScoreboardLastPlay | null;
      /** 'even' | 'pp' (power play) | 'en' (an empty net); team with the advantage. */
      strength: 'even' | 'pp' | 'en' | null;
      advantageTeamId: string | null;
    }
  | {
      family: 'baseball';
      lastPlay: ScoreboardLastPlay | null;
      half: 'top' | 'bottom' | 'middle' | 'end' | null;
      outs: number | null;
      balls: number | null;
      strikes: number | null;
      onFirst: boolean;
      onSecond: boolean;
      onThird: boolean;
      homeHits: number | null;
      awayHits: number | null;
    }
  | { family: 'soccer'; lastPlay: ScoreboardLastPlay | null; addedTime: boolean };

export interface GameSnapshot {
  id: string;
  sport: SportId;
  shortName: string;
  name: string;
  startTime: string | null;
  phase: Phase;
  statusName: string;
  detail: string;
  period: number | null;
  clockSec: number | null;
  displayClock: string | null;
  /** True between the last play of a quarter and the first play of the next ("End of 3rd"). */
  endOfPeriod: boolean;
  home: TeamSnap;
  away: TeamSnap;
  networks: string[];
  /** Football only, and only while LIVE; ESPN keeps stale situations around during halftime/final. */
  situation: Situation | null;
  /** Other sports' live situation (only while LIVE). */
  live?: LiveDetail | null;
  observedAt: number;
}

export type PlayKind = 'snap' | 'score' | 'pat' | 'kickoff' | 'timeout' | 'endPeriod' | 'admin';

export interface PlaySnap {
  id: string;
  seq: number;
  typeText: string;
  text: string;
  kind: PlayKind;
  period: number | null;
  displayClock: string | null;
  /** Real-world time of the play per ESPN, ms epoch. */
  wallclock: number | null;
  scoringPlay: boolean;
  scoreValue: number;
  awayScore: number | null;
  homeScore: number | null;
  isTurnover: boolean;
  /** Offense at the start of the play. */
  teamId: string | null;
  endYardsToEndzone: number | null;
  endTeamId: string | null;
}

export type BreakState = 'PRE' | 'LIVE' | 'BREAK' | 'HALFTIME' | 'FINAL' | 'UNKNOWN';

export interface Signal {
  name: string;
  weight: number;
  detail: string;
}

export interface Assessment {
  state: BreakState;
  /** Combined break likelihood 0–1 (noisy-OR of active signals). */
  score: number;
  signals: Signal[];
  /** Human-readable reasons, most important first. */
  reasons: string[];
  /** When the current state began (ms epoch). */
  since: number;
  /** Break forecast behind the state (forecast model only). */
  forecast?: { category: string; label: string; confidence: number; remainingSec: number | null; quietSec: number };
}
