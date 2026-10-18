import type { GameSnapshot, PlayKind } from '../engine/types';
import { categorizeFootball, classifyFootballPlay, FOOTBALL_CATEGORIES, FOOTBALL_LABELS, FOOTBALL_LINGER, FOOTBALL_RESUMES, footballChange, footballCompare, footballEndOfPeriod, footballFirstSeen, footballPhase, footballProgressSeconds, footballSituation, footballSummaryPlays, normalizedScore } from './football';
import { footballSynth } from './synth/football';
import type { CategorizablePlay, Excitement, SportModule } from './types';

// NFL: college football's model with the NFL's own stoppages (87 games, weeks 1-6 of 2026):
//  - the two-minute warning is a commercial in every broadcast (96% >= 90 s), so it gets its own
//    category instead of counting as a timeout;
//  - the commercial comes right after a score (91% >= 90 s); the kickoff after it is quick (10%), so
//    unlike college football the kickoff ends the break.

export const NFL_CATEGORIES = [...FOOTBALL_CATEGORIES, 'twoMinuteWarning'] as const;
const LABELS: Record<string, string> = { ...FOOTBALL_LABELS, twoMinuteWarning: 'Two-minute warning' };

function categorize(p: CategorizablePlay, prev?: { kind: PlayKind } | null): string | null {
  if (/two[- ]minute/i.test(p.typeText)) return 'twoMinuteWarning';
  return categorizeFootball(p, prev);
}

function excitement(g: GameSnapshot): Excitement {
  const redZone = g.situation?.isRedZone ?? false;
  const margin = Math.abs(g.home.score - g.away.score);
  const period = g.period ?? 0;
  const overtime = period > 4;
  // Two-minute drill: last two minutes of a half (or overtime) in a one-score game.
  const drill = !redZone && (period === 2 || period >= 4) && g.clockSec !== null && g.clockSec <= 120 && margin <= 8 && !g.endOfPeriod;
  const hot = redZone ? { label: 'red zone', phrase: 'is in the red zone' } : drill ? { label: 'two-minute drill', phrase: 'is in a two-minute drill' } : null;
  const score = normalizedScore(margin, 17, footballProgressSeconds(g) / 3600, redZone ? 25 : drill ? 20 : 0, overtime);
  const why = [hot?.label ?? null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

export const nfl: SportModule = {
  id: 'nfl',
  name: 'NFL',
  short: 'NFL',
  level: 'pro',
  family: 'football',
  espn: { path: 'football/nfl' },
  phaseOf: (statusName, state, detail) => footballPhase(statusName, state, detail),
  endOfPeriod: footballEndOfPeriod,
  situationOf: (s, home, away) => ({ situation: footballSituation(s, home, away), live: null }),
  summaryPlays: footballSummaryPlays,
  classifyPlay: classifyFootballPlay,
  inferFirstSeen: footballFirstSeen,
  inferChange: footballChange,
  breaks: {
    categories: NFL_CATEGORIES,
    labels: LABELS,
    categorize,
    resumes: FOOTBALL_RESUMES,
    // NFL broadcasts take the commercial after the score; the kickoff that follows is play again.
    linger: FOOTBALL_LINGER,
    modelFile: 'config/break-models/nfl.json',
  },
  presets: {
    low: { minBreakSeconds: 60, confidence: 0.75, replaceIfHomeRemainingSeconds: 120, upgradeToHot: false, excludeCategories: [] },
    medium: { minBreakSeconds: 60, confidence: 0.7, replaceIfHomeRemainingSeconds: 90, upgradeToHot: false, excludeCategories: [] },
    high: { minBreakSeconds: 45, confidence: 0.65, replaceIfHomeRemainingSeconds: 60, upgradeToHot: true, excludeCategories: [] },
  },
  halftimeMaxSeconds: 1500,
  progressSeconds: footballProgressSeconds,
  excitement,
  compare: footballCompare,
  synth: footballSynth,
  highlights: { query: 'NFL', youtubeChannels: ['NFL', 'FOX Sports', 'CBS Sports', 'NBC Sports', 'ESPN'] },
};

// ---- regional CBS/FOX windows ---------------------------------------------------------------------

/** Networks whose Sunday NFL games are regional (your local station shows one of several). */
const REGIONAL_NETWORKS = new Set(['cbs', 'fox']);
const WINDOW_MS = 30 * 60_000;

export interface RegionalInput {
  game: GameSnapshot;
  /** Channel name the game resolved to (lineup key). */
  channel: string;
}

/**
 * Which NFL games in a multi-game CBS/FOX window your station is known to air. A game is confirmed
 * when your market's team plays, or when the TV guide's program title for that channel names one of
 * its teams. Returns the games that share a window with another one, confirmed or not.
 */
export function regionalStatus(games: RegionalInput[], marketTeams: string[], titles: ReadonlyMap<string, string> = new Map()): Map<string, 'confirmed' | 'unconfirmed'> {
  const out = new Map<string, 'confirmed' | 'unconfirmed'>();
  const regional = games.filter((x) => x.game.sport === 'nfl' && REGIONAL_NETWORKS.has(x.channel.toLowerCase()) && x.game.startTime);
  for (const x of regional) {
    const start = Date.parse(x.game.startTime!);
    const window = regional.filter((y) => y.channel === x.channel && Math.abs(Date.parse(y.game.startTime!) - start) <= WINDOW_MS);
    if (window.length < 2) continue;
    const teams = [x.game.home, x.game.away];
    const title = titles.get(x.channel)?.toLowerCase() ?? '';
    const local = teams.some((t) => marketTeams.includes(t.abbr));
    const listed = title !== '' && teams.some((t) => t.name.length > 2 && title.includes(t.name.toLowerCase()));
    out.set(x.game.id, local || listed ? 'confirmed' : 'unconfirmed');
  }
  return out;
}
