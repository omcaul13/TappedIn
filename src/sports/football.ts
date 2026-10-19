// Football (college and NFL): ESPN parsing, stoppage categories and excitement. This is the code
// college football always ran on, moved here unchanged so other sports can sit beside it.
//
// ESPN quirks handled (all observed on 2026-10-17):
//  - "End of 3rd" arrives as STATUS_IN_PROGRESS            → LIVE + endOfPeriod
//  - halftime/final games still carry an old `situation`  → situation only kept while LIVE
//  - isRedZone=true with no down/distance (stale)          → red zone needs a down or a yard line
//  - the current drive's plays also appear in drives.previous → dedupe by id, sort by sequenceNumber
//  - play ids can be negative                              → ids are opaque strings

import type { GameState } from '../engine/gameStore';
import type { RankedCandidate } from '../engine/ranker';
import type { EventKind } from '../engine/gameStore';
import type { GameSnapshot, Phase, PlayKind, PlaySnap, Situation, TeamSnap } from '../engine/types';
import { basePhase, num, str, type Json } from '../espn/json';
import type { CategorizablePlay, Excitement, InferContext } from './types';

// ---- parsing ------------------------------------------------------------------------------------

export function footballPhase(statusName: string, state: string | null, detail: string): Phase {
  const phase = basePhase(statusName, state);
  if (phase === 'LIVE' && /halftime|^end of (the )?(2nd|second)/i.test(detail)) return 'HALFTIME';
  return phase;
}

export function footballEndOfPeriod(phase: Phase, statusName: string, detail: string): boolean {
  return phase === 'LIVE' && (statusName === 'STATUS_END_PERIOD' || /^end of/i.test(detail));
}

/**
 * Yards the offense needs to score, from text like "MIZ 30": if the ball is on the defense's side
 * that's 30 yards; on the offense's own side it's 100 - 30.
 */
export function yardsToEndzoneFrom(possessionText: string | null, offenseAbbr: string | null): number | null {
  if (!possessionText) return null;
  const m = /^(.*\S)\s+(\d{1,2})$/.exec(possessionText.trim()) ?? /^()(50)$/.exec(possessionText.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (n === 50) return 50;
  if (!offenseAbbr) return null;
  return m[1].toUpperCase() === offenseAbbr.toUpperCase() ? 100 - n : n;
}

export function footballSituation(s: Json, home: TeamSnap, away: TeamSnap): Situation {
  const possessionTeamId = s?.possession != null ? String(s.possession) : null;
  const offense = possessionTeamId === home.id ? home : possessionTeamId === away.id ? away : null;
  const downRaw = num(s?.down);
  const down = downRaw !== null && downRaw > 0 ? downRaw : null;
  const distRaw = num(s?.distance);
  const distance = down !== null && distRaw !== null && distRaw >= 0 ? distRaw : null;
  const possessionText = str(s?.possessionText);
  const yardsToEndzone = yardsToEndzoneFrom(possessionText, offense?.abbr ?? null);

  let isRedZone = false;
  let redZoneSource: Situation['redZoneSource'] = 'none';
  if (yardsToEndzone !== null && offense) {
    isRedZone = yardsToEndzone > 0 && yardsToEndzone <= 20;
    redZoneSource = 'derived';
  } else if (down !== null && typeof s?.isRedZone === 'boolean') {
    isRedZone = s.isRedZone;
    redZoneSource = 'espn';
  }

  const lp = s?.lastPlay;
  return {
    possessionTeamId,
    down,
    distance,
    yardsToEndzone,
    downDistanceText: str(s?.downDistanceText),
    possessionText,
    isRedZone,
    redZoneSource,
    homeTimeouts: num(s?.homeTimeouts),
    awayTimeouts: num(s?.awayTimeouts),
    lastPlay: lp?.id != null ? { id: String(lp.id), typeText: str(lp?.type?.text) ?? '', text: str(lp?.text) ?? '', scoreValue: num(lp?.scoreValue) ?? 0 } : null,
  };
}

export function classifyFootballPlay(typeText: string, scoringPlay: boolean, scoreValue: number): PlayKind {
  const t = typeText.toLowerCase();
  if (/end (period|of (the )?(half|game|regulation|quarter))|^end period/.test(t)) return 'endPeriod';
  if (/timeout/.test(t)) return 'timeout';
  if (/two[- ]minute|coin toss/.test(t)) return 'admin';
  if (/extra point|two[- ]point|2pt|conversion|\bpat\b/.test(t)) return 'pat';
  if (scoringPlay || scoreValue > 0 || /touchdown|field goal good|safety/.test(t)) return 'score';
  if (/kickoff/.test(t)) return 'kickoff';
  return 'snap';
}

export function normalizeFootballPlay(p: Json, index: number): PlaySnap | null {
  if (p?.id == null) return null;
  const typeText = str(p?.type?.text) ?? '';
  const scoringPlay = p?.scoringPlay === true;
  const scoreValue = num(p?.scoreValue) ?? 0;
  const wc = str(p?.wallclock) ? Date.parse(p.wallclock) : NaN;
  return {
    id: String(p.id),
    seq: num(p?.sequenceNumber) ?? index,
    typeText,
    text: str(p?.text) ?? '',
    kind: classifyFootballPlay(typeText, scoringPlay, scoreValue),
    period: num(p?.period?.number),
    displayClock: str(p?.clock?.displayValue),
    wallclock: Number.isFinite(wc) ? wc : null,
    scoringPlay,
    scoreValue,
    awayScore: num(p?.awayScore),
    homeScore: num(p?.homeScore),
    isTurnover: p?.isTurnover === true,
    teamId: p?.start?.team?.id != null ? String(p.start.team.id) : null,
    endYardsToEndzone: num(p?.end?.yardsToEndzone),
    endTeamId: p?.end?.team?.id != null ? String(p.end.team.id) : null,
  };
}

/** All plays in a summary, deduped by id (last copy wins) and in game order. */
export function footballSummaryPlays(body: Json): PlaySnap[] {
  const raw: Json[] = [];
  for (const d of body?.drives?.previous ?? []) for (const p of d?.plays ?? []) raw.push(p);
  for (const p of body?.drives?.current?.plays ?? []) raw.push(p);
  const byId = new Map<string, PlaySnap>();
  raw.forEach((p, i) => {
    const n = normalizeFootballPlay(p, i);
    if (n) byId.set(n.id, n);
  });
  return [...byId.values()].sort((a, b) => a.seq - b.seq || (a.wallclock ?? 0) - (b.wallclock ?? 0));
}

// ---- scoreboard inference (gameStore) ------------------------------------------------------------

/** First seen between quarters (e.g. "15:00 - 2nd" before the first snap): that's a TV break. */
export function footballFirstSeen(g: GameState, snap: GameSnapshot, ctx: InferContext): void {
  if (snap.phase === 'LIVE' && (snap.endOfPeriod || (snap.clockSec === 900 && (snap.period === 2 || snap.period === 4)))) {
    ctx.push({ kind: 'endPeriod', at: ctx.est, seenAt: ctx.now, order: ctx.order(), playId: null, source: 'scoreboard', detail: `quarter break (${snap.detail})` });
    const ended = snap.endOfPeriod ? snap.period : (snap.period ?? 2) - 1;
    ctx.setLastPlay({ playId: null, at: ctx.est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: ended, isTurnover: false });
  }
}

export function footballChange(g: GameState, prev: GameSnapshot, snap: GameSnapshot, ctx: InferContext): void {
  const { est, now } = ctx;
  // Score changed (catches scores even if we missed the play).
  if (snap.home.score + snap.away.score > prev.home.score + prev.away.score && snap.phase === 'LIVE') {
    const diff = snap.home.score + snap.away.score - (prev.home.score + prev.away.score);
    const kind: EventKind = diff === 1 || diff === 2 ? 'pat' : 'score';
    ctx.pushInferred({ kind, at: est, seenAt: now, order: ctx.order(), playId: null, source: 'scoreboard', detail: `score ${prev.away.score}-${prev.home.score} -> ${snap.away.score}-${snap.home.score}` });
  }

  // Timeout counter dropped (counters reset upward at halftime; ignore increases).
  const ps = prev.situation;
  const s = snap.situation;
  if (ps && s) {
    for (const side of ['home', 'away'] as const) {
      const before = side === 'home' ? ps.homeTimeouts : ps.awayTimeouts;
      const after = side === 'home' ? s.homeTimeouts : s.awayTimeouts;
      if (before !== null && after !== null && after < before) {
        ctx.pushInferred({ kind: 'timeout', at: est, seenAt: now, order: ctx.order(), playId: null, source: 'scoreboard', detail: `${snap[side].abbr} timeouts ${before}->${after}` });
      }
    }
  }

  // End of a quarter shows up in the status detail before (or instead of) an "End Period" play.
  if (snap.endOfPeriod && !prev.endOfPeriod) {
    ctx.pushInferred({ kind: 'endPeriod', at: est, seenAt: now, order: ctx.order(), playId: null, source: 'scoreboard', detail: snap.detail });
    ctx.setLastPlay({ playId: null, at: est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: snap.period, isTurnover: false });
  } else if (snap.phase === 'LIVE' && !prev.endOfPeriod && prev.period !== null && snap.period !== null && snap.period > prev.period && (snap.period === 2 || snap.period === 4)) {
    // Jumped straight into the next quarter between two polls: we missed "End of 1st/3rd".
    ctx.pushInferred({ kind: 'endPeriod', at: est, seenAt: now, order: ctx.order(), playId: null, source: 'scoreboard', detail: `quarter break (now ${snap.detail})` });
    ctx.setLastPlay({ playId: null, at: est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: prev.period, isTurnover: false });
  }
}

// ---- break categories ----------------------------------------------------------------------------
// From 76 college games (10/10 + 10/17/2026): after the end of Q1/Q3 the next snap is >= 90 s away 99%
// of the time; after a kickoff that follows a score 70%; after a team timeout 50%; after an ordinary
// play 6-9% -- but once an ordinary play has been followed by 60-90 s of quiet, odds of a long break
// rise to 51-66% (that's how TV timeouts, which aren't in play-by-play, show up).

export const FOOTBALL_CATEGORIES = ['endOfQuarter', 'kickoffAfterScore', 'teamTimeout', 'changeOfPossession', 'injury', 'review', 'scorePAT', 'ordinary'] as const;
export type FootballCategory = (typeof FOOTBALL_CATEGORIES)[number];

export const FOOTBALL_LABELS: Record<FootballCategory, string> = {
  endOfQuarter: 'End of quarter',
  kickoffAfterScore: 'Kickoff after a score',
  teamTimeout: 'Timeout',
  changeOfPossession: 'Change of possession',
  injury: 'Injury stoppage',
  review: 'Replay review',
  scorePAT: 'Score',
  ordinary: 'Stoppage',
};

/** Category of the stoppage that follows `p`; null when the play doesn't start a forecastable break (end of half). */
export function categorizeFootball(p: CategorizablePlay, prev?: { kind: PlayKind } | null): FootballCategory | null {
  const t = p.typeText;
  if (p.kind === 'timeout' || /two[- ]minute/i.test(t)) return 'teamTimeout';
  if (p.kind === 'endPeriod') return p.period === 2 ? null : 'endOfQuarter';
  if (p.kind === 'kickoff' && prev && (prev.kind === 'score' || prev.kind === 'pat')) return 'kickoffAfterScore';
  if (/injur/i.test(p.text)) return 'injury';
  if (/\b(review|challenge|overturned|upheld)\b/i.test(p.text)) return 'review';
  if (p.isTurnover || /punt|interception|fumble recovery \(opponent\)|field goal missed|missed field goal|turnover on downs/i.test(t)) return 'changeOfPossession';
  if (p.kind === 'score' || p.kind === 'pat') return 'scorePAT';
  return 'ordinary';
}

/** TD/FG -> PAT -> kickoff: the commercial usually comes after the kickoff, so the kickoff continues the break. */
export function footballContinues(play: { kind: PlayKind }, triggerCategory: string): string | null {
  return play.kind === 'kickoff' && triggerCategory === 'scorePAT' ? 'kickoffAfterScore' : null;
}

export const FOOTBALL_RESUMES: ReadonlySet<PlayKind> = new Set<PlayKind>(['snap', 'kickoff', 'score']);
export const FOOTBALL_LINGER: ReadonlySet<string> = new Set(['scorePAT', 'kickoffAfterScore']);

// ---- excitement ----------------------------------------------------------------------------------

const QUARTER = 15 * 60;

export function footballProgressSeconds(g: GameSnapshot): number {
  const period = g.period ?? 0;
  const clock = g.clockSec ?? QUARTER;
  return (period - 1) * QUARTER + (QUARTER - Math.min(QUARTER, clock));
}

/** Normalized 0–100 score shared by every sport: close + late, plus a bonus for a hot moment and overtime. */
export function normalizedScore(margin: number, scale: number, lateness: number, hotBonus: number, overtime: boolean): number {
  const closeness = Math.max(0, 1 - margin / scale);
  const late = Math.max(0, Math.min(1, lateness));
  const raw = 100 * closeness * (0.35 + 0.65 * late) + hotBonus + (overtime ? 15 : 0);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function footballExcitement(g: GameSnapshot): Excitement {
  const redZone = g.situation?.isRedZone ?? false;
  const margin = Math.abs(g.home.score - g.away.score);
  const overtime = (g.period ?? 0) > 4;
  const hot = redZone ? { label: 'red zone', phrase: 'is in the red zone' } : null;
  const score = normalizedScore(margin, 17, footballProgressSeconds(g) / (4 * QUARTER), redZone ? 25 : 0, overtime);
  const why = [redZone ? 'red zone' : null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

/** Red-zone games first; then closest score, then later in the game, then not shown elsewhere. */
export function footballCompare(a: RankedCandidate, b: RankedCandidate): number {
  return Number(!!b.hot) - Number(!!a.hot) || a.margin - b.margin || b.progress - a.progress || Number(a.shownElsewhere) - Number(b.shownElsewhere) || a.view.game.id.localeCompare(b.view.game.id);
}
