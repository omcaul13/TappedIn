// Basketball (men's and women's college, NBA, WNBA): ESPN parsing, stoppage categories and
// excitement. The four leagues share everything but the clock (halves vs quarters, 20/12/10-minute
// periods) and which timeouts are TV breaks, so each league's module is this family plus a few numbers.
//
// What ESPN's play-by-play shows (Feb–Mar and Aug 2026 games):
//  - college: "OfficialTVTimeOut" at the media timeouts (first dead ball under 16/12/8/4 minutes of each
//    half; women's: under 5:00 of each quarter), "ShortTimeOut", "RegularTimeOut";
//  - NBA: only "Full Timeout" (the mandatory TV timeouts are charged to a team and look the same);
//  - WNBA: "Full Timeout" plus "Official Timeout";
//  - every league: "End Period", "End Game", coach's challenges and replay reviews.

import type { EventKind, GameState } from '../engine/gameStore';
import type { RankedCandidate } from '../engine/ranker';
import type { GameSnapshot, LiveDetail, Phase, PlayKind, PlaySnap, TeamSnap } from '../engine/types';
import { basePhase, num, str, type Json } from '../espn/json';
import { normalizedScore } from './football';
import type { BreakSpec, CategorizablePlay, Excitement, InferContext, SportModule, SportPreset } from './types';

export interface BasketballClock {
  /** Regulation periods: 2 halves (men's college) or 4 quarters. */
  periods: 2 | 4;
  periodSeconds: number;
  /** Late-game hot window: the last this-many seconds of regulation (and all of overtime)… */
  lateSeconds: number;
  /** …with the margin at most this. */
  lateMargin: number;
  /** "clutch time" (pro) or "crunch time" (college). */
  lateLabel: string;
}

const OT_SECONDS = 5 * 60;

// ---- parsing ------------------------------------------------------------------------------------

export function basketballPhase(clock: BasketballClock, statusName: string, state: string | null, detail: string): Phase {
  const phase = basePhase(statusName, state);
  if (phase !== 'LIVE') return phase;
  if (/halftime/i.test(detail)) return 'HALFTIME';
  const half = clock.periods === 2 ? /^end of (the )?(1st|first) half/i : /^end of (the )?(2nd|second)( quarter)?$/i;
  return half.test(detail) ? 'HALFTIME' : phase;
}

export function basketballEndOfPeriod(phase: Phase, statusName: string, detail: string): boolean {
  return phase === 'LIVE' && (statusName === 'STATUS_END_PERIOD' || /^end of/i.test(detail));
}

export function basketballSituation(s: Json): LiveDetail {
  const lp = s?.lastPlay;
  return {
    family: 'basketball',
    lastPlay: lp?.id != null ? { id: String(lp.id), typeText: str(lp?.type?.text) ?? '', text: str(lp?.text) ?? '', scoreValue: num(lp?.scoreValue) ?? 0 } : null,
    possessionTeamId: s?.possession != null ? String(s.possession) : null,
    homeBonus: typeof s?.homeBonus === 'boolean' ? s.homeBonus : null,
    awayBonus: typeof s?.awayBonus === 'boolean' ? s.awayBonus : null,
  };
}

export function classifyBasketballPlay(typeText: string, scoringPlay: boolean, scoreValue: number): PlayKind {
  const t = typeText.toLowerCase();
  if (/^end (period|game)|end of (period|game|half|quarter)/.test(t)) return 'endPeriod';
  if (/time ?out/.test(t)) return 'timeout';
  if (/substitution|challenge|review|ejection|delay technical/.test(t)) return 'admin';
  if (scoringPlay || scoreValue > 0) return 'score';
  return 'snap';
}

/** Top-level `plays` (basketball, hockey, baseball): deduped by id and in game order. */
export function topLevelPlays(body: Json, classify: (typeText: string, scoring: boolean, value: number) => PlayKind): PlaySnap[] {
  const byId = new Map<string, PlaySnap>();
  (body?.plays ?? []).forEach((p: Json, i: number) => {
    if (p?.id == null) return;
    const typeText = str(p?.type?.text) ?? '';
    const scoringPlay = p?.scoringPlay === true;
    const scoreValue = num(p?.scoreValue) ?? 0;
    const wc = str(p?.wallclock) ? Date.parse(p.wallclock) : NaN;
    byId.set(String(p.id), {
      id: String(p.id),
      seq: num(p?.sequenceNumber) ?? i,
      typeText,
      text: str(p?.text) ?? '',
      kind: classify(typeText, scoringPlay, scoreValue),
      period: num(p?.period?.number),
      displayClock: str(p?.clock?.displayValue),
      wallclock: Number.isFinite(wc) ? wc : null,
      scoringPlay,
      scoreValue,
      awayScore: num(p?.awayScore),
      homeScore: num(p?.homeScore),
      isTurnover: /turnover/i.test(typeText),
      teamId: p?.team?.id != null ? String(p.team.id) : null,
      endYardsToEndzone: null,
      endTeamId: null,
      ...(str(p?.strength?.text) ? { strength: str(p.strength.text) } : {}),
    });
  });
  return [...byId.values()].sort((a, b) => a.seq - b.seq || (a.wallclock ?? 0) - (b.wallclock ?? 0));
}

export const basketballSummaryPlays = (body: Json) => topLevelPlays(body, classifyBasketballPlay);

// ---- scoreboard inference --------------------------------------------------------------------------

/** Between periods on the scoreboard ("End of 1st") is a stoppage even before the "End Period" play arrives. */
export function periodBreaksFromScoreboard(halftimePeriod: number) {
  const endPeriod = (snap: GameSnapshot, period: number | null, ctx: InferContext, detail: string) => {
    ctx.pushInferred({ kind: 'endPeriod' as EventKind, at: ctx.est, seenAt: ctx.now, order: ctx.order(), playId: null, source: 'scoreboard', detail });
    ctx.setLastPlay({ playId: null, at: ctx.est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period, isTurnover: false });
  };
  return {
    first(_g: GameState, snap: GameSnapshot, ctx: InferContext): void {
      if (snap.phase === 'LIVE' && snap.endOfPeriod) endPeriod(snap, snap.period, ctx, `period break (${snap.detail})`);
    },
    change(_g: GameState, prev: GameSnapshot, snap: GameSnapshot, ctx: InferContext): void {
      if (snap.endOfPeriod && !prev.endOfPeriod) endPeriod(snap, snap.period, ctx, snap.detail);
      else if (snap.phase === 'LIVE' && !prev.endOfPeriod && prev.phase === 'LIVE' && prev.period !== null && snap.period !== null && snap.period > prev.period && prev.period !== halftimePeriod) {
        // Jumped into the next period between two polls: we missed the "End of 1st".
        endPeriod(snap, prev.period, ctx, `period break (now ${snap.detail})`);
      }
    },
  };
}

// ---- break categories ----------------------------------------------------------------------------

export const BASKETBALL_CATEGORIES = ['tvTimeout', 'teamTimeout', 'shortTimeout', 'endOfPeriod', 'review', 'foul', 'made', 'ordinary'] as const;
export const BASKETBALL_LABELS: Record<string, string> = {
  tvTimeout: 'TV timeout',
  teamTimeout: 'Timeout',
  shortTimeout: 'Short timeout',
  endOfPeriod: 'End of period',
  review: 'Replay review',
  foul: 'Foul',
  made: 'Basket',
  ordinary: 'Stoppage',
};

export function basketballCategorizer(halftimePeriod: number) {
  return (p: CategorizablePlay): string | null => {
    const t = p.typeText;
    if (p.kind === 'timeout') {
      if (/official|tv/i.test(t)) return 'tvTimeout';
      if (/short|20 ?sec|reset/i.test(t)) return 'shortTimeout';
      return 'teamTimeout';
    }
    if (p.kind === 'endPeriod') return /game/i.test(t) || p.period === halftimePeriod ? null : 'endOfPeriod';
    if (/challenge|review/i.test(t)) return 'review';
    if (p.kind === 'admin') return null;
    if (/foul/i.test(t)) return 'foul';
    if (p.kind === 'score') return 'made';
    return 'ordinary';
  };
}

export const BASKETBALL_RESUMES: ReadonlySet<PlayKind> = new Set<PlayKind>(['snap', 'score']);

export function basketballBreaks(id: string, halftimePeriod: number): BreakSpec {
  return {
    categories: BASKETBALL_CATEGORIES,
    labels: BASKETBALL_LABELS,
    categorize: basketballCategorizer(halftimePeriod),
    resumes: BASKETBALL_RESUMES,
    linger: new Set(),
    // Substitutions come in during timeouts and at halftime: they don't change the stoppage.
    ignore: (p) => /substitution/i.test(p.typeText),
    modelFile: `config/break-models/${id}.json`,
  };
}

// ---- excitement ----------------------------------------------------------------------------------

export function basketballProgressSeconds(clock: BasketballClock, g: GameSnapshot): number {
  const period = g.period ?? 0;
  if (period <= 0) return 0;
  if (period <= clock.periods) {
    const left = Math.min(clock.periodSeconds, g.clockSec ?? clock.periodSeconds);
    return (period - 1) * clock.periodSeconds + (clock.periodSeconds - left);
  }
  const ot = period - clock.periods;
  return clock.periods * clock.periodSeconds + (ot - 1) * OT_SECONDS + (OT_SECONDS - Math.min(OT_SECONDS, g.clockSec ?? OT_SECONDS));
}

/** Seconds of regulation left (0 in overtime). */
function regulationLeft(clock: BasketballClock, g: GameSnapshot): number {
  return Math.max(0, clock.periods * clock.periodSeconds - basketballProgressSeconds(clock, g));
}

export function basketballExcitement(clock: BasketballClock, g: GameSnapshot): Excitement {
  const margin = Math.abs(g.home.score - g.away.score);
  const overtime = (g.period ?? 0) > clock.periods;
  const late = overtime || regulationLeft(clock, g) <= clock.lateSeconds;
  const hotLate = late && margin <= clock.lateMargin && g.phase === 'LIVE';
  const hot = hotLate ? { label: overtime ? 'overtime' : clock.lateLabel, phrase: overtime ? 'is in overtime' : `is in ${clock.lateLabel}` } : null;
  const total = clock.periods * clock.periodSeconds;
  const score = normalizedScore(margin, 15, basketballProgressSeconds(clock, g) / total, hotLate ? 30 : 0, overtime);
  const why = [hot?.label ?? null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

/** Hot moments first, then the most exciting by score, then closest, then later. */
export function basketballCompare(a: RankedCandidate, b: RankedCandidate): number {
  return Number(!!b.hot) - Number(!!a.hot) || b.excitement.score - a.excitement.score || a.margin - b.margin || b.progress - a.progress || Number(a.shownElsewhere) - Number(b.shownElsewhere) || a.view.game.id.localeCompare(b.view.game.id);
}

// ---- one league ----------------------------------------------------------------------------------

export interface BasketballLeague {
  id: SportModule['id'];
  name: string;
  short: string;
  level: SportModule['level'];
  espn: SportModule['espn'];
  clock: BasketballClock;
  presets: SportModule['presets'];
  halftimeMaxSeconds: number;
  highlights: NonNullable<SportModule['highlights']>;
}

export const preset = (minBreakSeconds: number, confidence: number, replaceIfHomeRemainingSeconds: number, upgradeToHot: boolean, excludeCategories: string[] = []): SportPreset => ({ minBreakSeconds, confidence, replaceIfHomeRemainingSeconds, upgradeToHot, excludeCategories });

export function basketballLeague(l: BasketballLeague, synth: SportModule['synth']): SportModule {
  const halftimePeriod = l.clock.periods / 2;
  const inference = periodBreaksFromScoreboard(halftimePeriod);
  return {
    id: l.id,
    name: l.name,
    short: l.short,
    level: l.level,
    family: 'basketball',
    espn: l.espn,
    phaseOf: (statusName, state, detail) => basketballPhase(l.clock, statusName, state, detail),
    endOfPeriod: basketballEndOfPeriod,
    situationOf: (s) => ({ situation: null, live: basketballSituation(s) }),
    summaryPlays: basketballSummaryPlays,
    classifyPlay: classifyBasketballPlay,
    inferFirstSeen: inference.first,
    inferChange: inference.change,
    breaks: basketballBreaks(l.id, halftimePeriod),
    highlights: l.highlights,
    presets: l.presets,
    halftimeMaxSeconds: l.halftimeMaxSeconds,
    progressSeconds: (g) => basketballProgressSeconds(l.clock, g),
    excitement: (g) => basketballExcitement(l.clock, g),
    compare: basketballCompare,
    synth,
  };
}

export type { TeamSnap };
