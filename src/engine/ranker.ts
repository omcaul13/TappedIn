import { sportOf } from '../sports';
import { footballProgressSeconds } from '../sports/football';
import type { Excitement, HotMoment } from '../sports/types';
import type { Assessment, GameSnapshot, SportId } from './types';

// Which live game should fill a screen? Your rules, in order:
//   1. Only games actually in play (detector says LIVE, and with the forecast model not probably
//      in a stoppage of their own) on a channel in your lineup.
//   2. Never a game (or channel) already on another screen, unless nothing else is left.
//   3. Tiers: the screen's own sport first; then a sport another screen is watching; then any sport.
//   4. Within the screen's sport, that sport's own order (football: red zone first, then closest
//      score, then later in the game). Across sports, the normalized 0–100 excitement score.

export interface GameView {
  game: GameSnapshot;
  assessment: Assessment;
  /** Channel name + guide number, or null when the network isn't in the lineup. */
  channel: { name: string; number: number } | null;
}

/** 1 = same sport as the screen's home game, 2 = a sport another screen is watching, 3 = any other sport. */
export type Tier = 1 | 2 | 3;

export interface RankedCandidate {
  view: GameView;
  sport: SportId;
  tier: Tier;
  /** The sport's hot moment right now (red zone, power play…), or null. */
  hot: HotMoment | null;
  excitement: Excitement;
  margin: number;
  /** Seconds of game time elapsed (bigger = later). */
  progress: number;
  shownElsewhere: boolean;
  why: string;
}

export interface RankOptions {
  /** Games that must never be picked (this screen's own home game). */
  exclude: ReadonlySet<string>;
  /** Games currently on other screens. */
  shownGames: ReadonlySet<string>;
  /** Channels currently on other screens (regional ABC/FOX games share one). */
  shownChannels: ReadonlySet<number>;
  /** Skip games that are probably in a stoppage of their own (break forecast at or above this). */
  maxBreakRisk?: number;
  /** The screen's sport (its home game's). Without one, every game is tier 1. */
  homeSport?: SportId;
  /** Sports other screens are watching (their home games'). */
  otherSports?: ReadonlySet<SportId>;
}

/** Football's game clock math (kept for callers that predate src/sports/). */
export const progressSeconds = footballProgressSeconds;

export function describeGame(g: GameSnapshot): string {
  const score = `${g.away.abbr} ${g.away.score}-${g.home.score} ${g.home.abbr}`;
  const s = g.situation;
  const where = s?.downDistanceText ? `, ${s.downDistanceText}` : '';
  return `${score} ${g.detail}${where}`;
}

export const TIER_LABEL: Record<Tier, string> = { 1: 'Same sport', 2: "Other screen's sport", 3: 'Other sport' };

/** "Same sport", "Other screen's sport (NHL)", "Other sport (NBA)". */
export function tierLabel(c: Pick<RankedCandidate, 'tier' | 'sport'>): string {
  return c.tier === 1 ? TIER_LABEL[1] : `${TIER_LABEL[c.tier]} (${sportOf(c.sport).short})`;
}

function tierOf(sport: SportId, opts: RankOptions): Tier {
  if (!opts.homeSport || sport === opts.homeSport) return 1;
  return opts.otherSports?.has(sport) ? 2 : 3;
}

export function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.sport === b.sport) return sportOf(a.sport).compare(a, b);
  return b.excitement.score - a.excitement.score || a.view.game.id.localeCompare(b.view.game.id);
}

export function rankCandidates(views: Iterable<GameView>, opts: RankOptions): { ranked: RankedCandidate[]; duplicateFallback: boolean } {
  const eligible: RankedCandidate[] = [];
  for (const view of views) {
    const g = view.game;
    if (opts.exclude.has(g.id)) continue;
    if (!view.channel) continue;
    if (view.assessment.state !== 'LIVE' || g.phase !== 'LIVE') continue;
    if (opts.maxBreakRisk !== undefined && (view.assessment.forecast?.confidence ?? 0) >= opts.maxBreakRisk) continue;
    const mod = sportOf(g.sport);
    const shownElsewhere = opts.shownGames.has(g.id) || opts.shownChannels.has(view.channel.number);
    const excitement = mod.excitement(g);
    const margin = Math.abs(g.home.score - g.away.score);
    const progress = mod.progressSeconds(g);
    const why = [excitement.why, shownElsewhere ? 'already on another screen' : null].filter(Boolean).join(', ');
    eligible.push({ view, sport: mod.id, tier: tierOf(mod.id, opts), hot: excitement.hot, excitement, margin, progress, shownElsewhere, why });
  }

  const fresh = eligible.filter((c) => !c.shownElsewhere);
  const pool = fresh.length ? fresh : eligible;
  const duplicateFallback = fresh.length === 0 && eligible.length > 0;

  pool.sort((a, b) => compareCandidates(a, b) || Number(a.shownElsewhere) - Number(b.shownElsewhere));
  return { ranked: pool, duplicateFallback };
}
