// MLB: ESPN parsing, stoppage categories and excitement.
//
// What ESPN's play-by-play shows (Aug–Sep 2026): every pitch is a play with a wallclock; "End Inning"
// closes each half-inning (period type "Mid"/"End"); a pitching change is a "Play Result" ("Armstrong
// relieved Herrin"); "Start Inning", "Start Batter/Pitcher" and the "Play Result" summaries are
// bookkeeping. Between half-innings the next pitch comes 2–3 minutes later (median 147 s, never under
// 90 s): that's the commercial. You chose to switch on it at Medium and High only, so at Low it's
// excluded and baseball screens stay put between innings (pitching changes still count when long).
// The scoreboard's status detail is "Top 4th" / "Mid 4th" / "Bot 4th" / "End 4th"; hits per team
// come with the competitors (no-hitter watch).

import type { GameSnapshot, LiveDetail, Phase, PlayKind, PlaySnap, SportId } from '../engine/types';
import { basePhase, num, str, type Json } from '../espn/json';
import { basketballCompare, preset } from './basketball';
import { normalizedScore } from './football';
import { prepareSynthGame } from './synth/clock';
import type { SynthAdapter, SynthGame } from './synth/types';
import type { CategorizablePlay, Excitement, SportModule } from './types';

const HALF_SECONDS = 600; // nominal half-inning length for ordering
const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function baseballPhase(statusName: string, state: string | null): Phase {
  return basePhase(statusName, state);
}

/** Between half-innings on the scoreboard ("Mid 4th", "End 4th"). */
export const baseballEndOfPeriod = (phase: Phase, _status: string, detail: string) => phase === 'LIVE' && /^(mid|end)\b/i.test(detail);

const truthy = (v: unknown) => v === true || (typeof v === 'object' && v !== null);

function hitsOf(comp: Json, side: 'home' | 'away'): number | null {
  const c = (comp?.competitors ?? []).find((x: Json) => x?.homeAway === side);
  return num(c?.hits);
}

export function baseballSituation(s: Json, comp: Json, detail: string): LiveDetail {
  const lp = s?.lastPlay;
  const half = /^top/i.test(detail) ? 'top' : /^bot/i.test(detail) ? 'bottom' : /^mid/i.test(detail) ? 'middle' : /^end/i.test(detail) ? 'end' : null;
  return {
    family: 'baseball',
    lastPlay: lp?.id != null ? { id: String(lp.id), typeText: str(lp?.type?.text) ?? '', text: str(lp?.text) ?? '', scoreValue: num(lp?.scoreValue) ?? 0 } : null,
    half,
    outs: num(s?.outs),
    balls: num(s?.balls),
    strikes: num(s?.strikes),
    onFirst: truthy(s?.onFirst),
    onSecond: truthy(s?.onSecond),
    onThird: truthy(s?.onThird),
    homeHits: hitsOf(comp, 'home'),
    awayHits: hitsOf(comp, 'away'),
  };
}

const PITCH = /^(ball|strike|foul|pitch|automatic|in play|hit by pitch|intent)|ball in play/i;
const CHANGE = /relieved|pitching change|now pitching/i;

export function classifyBaseballPlay(typeText: string, scoringPlay: boolean, scoreValue: number, text = ''): PlayKind {
  if (/^end inning/i.test(typeText)) return 'endPeriod';
  if (scoringPlay || scoreValue > 0) return 'score';
  if (CHANGE.test(text) || /mound visit|delay|review|challenge|injury/i.test(`${typeText} ${text}`)) return 'timeout';
  if (/^(start inning|start batter|end batter|play result)/i.test(typeText)) return 'admin';
  if (/^pitch \d/i.test(text) || PITCH.test(typeText)) return 'snap';
  return 'admin';
}

export function baseballSummaryPlays(body: Json): PlaySnap[] {
  const byId = new Map<string, PlaySnap>();
  (body?.plays ?? []).forEach((p: Json, i: number) => {
    if (p?.id == null) return;
    const typeText = str(p?.type?.text) ?? '';
    const text = str(p?.text) ?? '';
    const scoringPlay = p?.scoringPlay === true;
    const scoreValue = num(p?.scoreValue) ?? 0;
    const wc = str(p?.wallclock) ? Date.parse(p.wallclock) : NaN;
    byId.set(String(p.id), {
      id: String(p.id),
      seq: i, // ESPN restarts sequenceNumber every at-bat; file order is game order
      typeText,
      text,
      kind: classifyBaseballPlay(typeText, scoringPlay, scoreValue, text),
      period: num(p?.period?.number),
      displayClock: str(p?.period?.type),
      wallclock: Number.isFinite(wc) ? wc : null,
      scoringPlay,
      scoreValue,
      awayScore: num(p?.awayScore),
      homeScore: num(p?.homeScore),
      isTurnover: false,
      teamId: p?.team?.id != null ? String(p.team.id) : null,
      endYardsToEndzone: null,
      endTeamId: null,
    });
  });
  return [...byId.values()];
}

export const BASEBALL_CATEGORIES = ['halfInning', 'pitchingChange', 'review', 'delay', 'score', 'pitch'] as const;
const LABELS: Record<string, string> = { halfInning: 'Between innings', pitchingChange: 'Pitching change', review: 'Replay review', delay: 'Delay', score: 'Run scores', pitch: 'Between pitches' };

export function categorizeBaseball(p: CategorizablePlay): string | null {
  if (p.kind === 'endPeriod') return 'halfInning';
  if (p.kind === 'timeout') return CHANGE.test(p.text) ? 'pitchingChange' : /review|challenge/i.test(`${p.typeText} ${p.text}`) ? 'review' : 'delay';
  if (p.kind === 'score') return 'score';
  if (p.kind === 'snap') return 'pitch';
  return null;
}

// ---- excitement ----------------------------------------------------------------------------------

/** Half-innings completed (top of the 1st = 0), from the scoreboard. */
function halvesDone(g: GameSnapshot): number {
  const inning = Math.max(1, g.period ?? 1);
  const live = g.live?.family === 'baseball' ? g.live : null;
  const h = live?.half ?? (/^bot/i.test(g.detail) ? 'bottom' : /^mid/i.test(g.detail) ? 'middle' : /^end/i.test(g.detail) ? 'end' : 'top');
  return (inning - 1) * 2 + (h === 'top' ? 0 : h === 'end' ? 2 : 1);
}

export const baseballProgressSeconds = (g: GameSnapshot) => halvesDone(g) * HALF_SECONDS + (g.live?.family === 'baseball' ? (g.live.outs ?? 0) * (HALF_SECONDS / 3) : 0);

export function baseballExcitement(g: GameSnapshot): Excitement {
  const margin = Math.abs(g.home.score - g.away.score);
  const inning = g.period ?? 0;
  const live = g.live?.family === 'baseball' ? g.live : null;
  const late = inning >= 7;
  const extras = inning >= 10;
  // Between half-innings ESPN can still list the last runners: they don't count.
  const between = !live || live.half === 'middle' || live.half === 'end';
  const risp = !between && (live.onSecond || live.onThird);
  const loaded = !between && live.onFirst && live.onSecond && live.onThird;
  // No-hitter watch: through 6+ innings, a team still without a hit.
  const noHit = inning >= 6 && live && (live.homeHits === 0 || live.awayHits === 0) ? (live.homeHits === 0 ? g.away.abbr : g.home.abbr) : null;
  const hot = noHit
    ? { label: `${noHit} no-hitter through ${ORD(inning - (live?.half === 'top' ? 1 : 0))}`, phrase: 'has a no-hitter going' }
    : extras && margin <= 1
      ? { label: 'extra innings', phrase: 'is in extra innings' }
      : loaded
        ? { label: 'bases loaded', phrase: 'has the bases loaded' }
        : risp && (late || margin <= 2)
          ? { label: 'runners in scoring position', phrase: 'has runners in scoring position' }
          : null;
  const bonus = noHit ? 30 : extras && margin <= 1 ? 20 : loaded ? 20 : risp ? (late ? 25 : 15) : 0;
  const score = normalizedScore(margin, 5, halvesDone(g) / 18, bonus, false);
  const why = [hot?.label ?? null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

// ---- synth ---------------------------------------------------------------------------------------

interface BaseballSynthGame extends SynthGame {
  raw: Map<string, Json>;
}

const HIT = /^(single|double|triple|home run|ground rule double|inside the park)/i;

export const baseballSynth: SynthAdapter<BaseballSynthGame> = {
  prepare(body: Json, sport: SportId) {
    const g = prepareSynthGame(body, sport, baseballSummaryPlays);
    return g && { ...g, raw: new Map<string, Json>((body?.plays ?? []).map((p: Json) => [String(p.id), p])) };
  },
  snapshot(g, visible, t, delayMs) {
    const base = { id: g.id, sport: g.sport, shortName: g.shortName, name: g.name, startTime: new Date(g.start).toISOString(), networks: g.networks, observedAt: t, situation: null };
    const shown = g.plays.slice(0, visible);
    const lastScored = [...shown].reverse().find((p) => p.homeScore !== null);
    const home = { ...g.home, score: lastScored?.homeScore ?? 0 };
    const away = { ...g.away, score: lastScored?.awayScore ?? 0 };
    const last = shown.at(-1);
    if (!last) return { ...base, phase: 'PRE', statusName: 'STATUS_SCHEDULED', detail: new Date(g.start).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), period: 0, clockSec: null, displayClock: null, endOfPeriod: false, home, away };
    const done = visible === g.plays.length && t - delayMs > last.wallclock! + 120_000;
    if (done) return { ...base, phase: 'FINAL', statusName: 'STATUS_FINAL', detail: g.finalDetail, period: last.period, clockSec: null, displayClock: null, endOfPeriod: false, home, away };
    const r = g.raw.get(last.id) ?? {};
    const inning = last.period ?? 1;
    const type = String(r?.period?.type ?? 'Top');
    const half = /^top/i.test(type) ? 'top' : /^bot/i.test(type) ? 'bottom' : /^mid/i.test(type) ? 'middle' : 'end';
    const detail = `${half === 'top' ? 'Top' : half === 'bottom' ? 'Bot' : half === 'middle' ? 'Mid' : 'End'} ${ORD(inning)}`;
    let homeHits = 0;
    let awayHits = 0;
    for (const p of shown) {
      if (!HIT.test(p.typeText) || !/^pitch/i.test(p.text)) continue;
      const pr = g.raw.get(p.id);
      if (/^top/i.test(String(pr?.period?.type))) awayHits++;
      else homeHits++;
    }
    const between = half === 'middle' || half === 'end';
    const live: LiveDetail = {
      family: 'baseball',
      lastPlay: { id: last.id, typeText: last.typeText, text: last.text, scoreValue: last.scoreValue },
      half,
      outs: between ? 0 : num(r?.outs),
      balls: num(r?.pitchCount?.balls),
      strikes: num(r?.pitchCount?.strikes),
      onFirst: !between && truthy(r?.onFirst),
      onSecond: !between && truthy(r?.onSecond),
      onThird: !between && truthy(r?.onThird),
      homeHits,
      awayHits,
    };
    return { ...base, phase: 'LIVE', statusName: 'STATUS_IN_PROGRESS', detail, period: inning, clockSec: null, displayClock: null, endOfPeriod: between, home, away, live };
  },
};

export const mlb: SportModule = {
  id: 'mlb',
  name: 'MLB',
  short: 'MLB',
  level: 'pro',
  family: 'baseball',
  espn: { path: 'baseball/mlb' },
  phaseOf: (statusName, state) => baseballPhase(statusName, state),
  endOfPeriod: baseballEndOfPeriod,
  situationOf: (s, _home, _away, { comp, detail }) => ({ situation: null, live: baseballSituation(s, comp, detail) }),
  summaryPlays: baseballSummaryPlays,
  classifyPlay: classifyBaseballPlay,
  inferFirstSeen: (_g, snap, ctx) => {
    if (snap.endOfPeriod) ctx.setLastPlay({ playId: null, at: ctx.est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Inning', text: snap.detail, period: snap.period, isTurnover: false });
  },
  inferChange: (_g, prev, snap, ctx) => {
    // "Mid 4th" / "End 4th" on the scoreboard before the End Inning play arrives.
    if (snap.endOfPeriod && !prev.endOfPeriod) ctx.setLastPlay({ playId: null, at: ctx.est, order: ctx.order(), kind: 'endPeriod', typeText: 'End Inning', text: snap.detail, period: snap.period, isTurnover: false });
  },
  highlights: { query: 'MLB', youtubeChannels: ['MLB', 'FOX Sports', 'TBS', 'ESPN'] },
  breaks: {
    categories: BASEBALL_CATEGORIES,
    labels: LABELS,
    categorize: categorizeBaseball,
    resumes: new Set<PlayKind>(['snap', 'score']),
    linger: new Set(['score']),
    // Bookkeeping plays (new batter, at-bat summaries, inning start) don't change the stoppage.
    ignore: (p) => p.kind === 'admin',
    modelFile: 'config/break-models/mlb.json',
  },
  presets: {
    // Your call (10/18): half-innings switch only at Medium and High.
    low: preset(60, 0.8, 120, false, ['halfInning']),
    medium: preset(60, 0.75, 90, false),
    high: preset(45, 0.65, 60, true),
  },
  progressSeconds: baseballProgressSeconds,
  excitement: baseballExcitement,
  compare: basketballCompare,
  synth: baseballSynth,
};
