import type { Assessment, GameSnapshot } from './types';

// Which live game should fill a screen? Your rules, in order:
//   1. Only games actually in play (detector says LIVE, and with the forecast model not probably
//      in a stoppage of their own) on a channel in your lineup.
//   2. Never a game (or channel) already on another screen, unless nothing else is left.
//   3. Red-zone games first; among them closest score, then later in the game, then not shown elsewhere.
//   4. Otherwise closest score, then later in the game, then not shown elsewhere.

export interface GameView {
  game: GameSnapshot;
  assessment: Assessment;
  /** Channel name + guide number, or null when the network isn't in the lineup. */
  channel: { name: string; number: number } | null;
}

export interface RankedCandidate {
  view: GameView;
  redZone: boolean;
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
}

const QUARTER = 15 * 60;

export function progressSeconds(g: GameSnapshot): number {
  const period = g.period ?? 0;
  const clock = g.clockSec ?? QUARTER;
  return (period - 1) * QUARTER + (QUARTER - Math.min(QUARTER, clock));
}

export function describeGame(g: GameSnapshot): string {
  const score = `${g.away.abbr} ${g.away.score}-${g.home.score} ${g.home.abbr}`;
  const s = g.situation;
  const where = s?.downDistanceText ? `, ${s.downDistanceText}` : '';
  return `${score} ${g.detail}${where}`;
}

export function rankCandidates(views: Iterable<GameView>, opts: RankOptions): { ranked: RankedCandidate[]; duplicateFallback: boolean } {
  const eligible: RankedCandidate[] = [];
  for (const view of views) {
    const g = view.game;
    if (opts.exclude.has(g.id)) continue;
    if (!view.channel) continue;
    if (view.assessment.state !== 'LIVE' || g.phase !== 'LIVE') continue;
    if (opts.maxBreakRisk !== undefined && (view.assessment.forecast?.confidence ?? 0) >= opts.maxBreakRisk) continue;
    const shownElsewhere = opts.shownGames.has(g.id) || opts.shownChannels.has(view.channel.number);
    const redZone = g.situation?.isRedZone ?? false;
    const margin = Math.abs(g.home.score - g.away.score);
    const progress = progressSeconds(g);
    const why = [redZone ? 'red zone' : null, `margin ${margin}`, g.detail, shownElsewhere ? 'already on another screen' : null].filter(Boolean).join(', ');
    eligible.push({ view, redZone, margin, progress, shownElsewhere, why });
  }

  const fresh = eligible.filter((c) => !c.shownElsewhere);
  const pool = fresh.length ? fresh : eligible;
  const duplicateFallback = fresh.length === 0 && eligible.length > 0;

  pool.sort((a, b) => Number(b.redZone) - Number(a.redZone) || a.margin - b.margin || b.progress - a.progress || Number(a.shownElsewhere) - Number(b.shownElsewhere) || a.view.game.id.localeCompare(b.view.game.id));
  return { ranked: pool, duplicateFallback };
}
