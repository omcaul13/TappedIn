import type { GameSnapshot, PlaySnap, Situation, TeamSnap } from '../engine/types';
import { networksOf, normalizeSummaryPlays } from './normalize';

// Rebuild a game day from finished games' play-by-play (every play has a wallclock), so the director
// can be replayed against any past Saturday, not just days we recorded live.
// Lower fidelity than a real recording: no ESPN lag quirks, no timeout counters, and play-by-play is
// "available" for every game. A play becomes visible dataDelaySeconds after its wallclock.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type SynthEvent = { at: number; kind: 'snapshots'; snaps: GameSnapshot[] } | { at: number; kind: 'plays'; gameId: string; plays: PlaySnap[] };

export interface SynthOptions {
  dataDelaySeconds: number;
  scoreboardEverySeconds?: number;
  summaryEverySeconds?: number;
}

interface SynthGame {
  id: string;
  shortName: string;
  name: string;
  start: number;
  home: TeamSnap;
  away: TeamSnap;
  networks: string[];
  plays: PlaySnap[];
  rawEnd: Map<string, Json>;
  finalDetail: string;
}

const ORD = ['', '1st', '2nd', '3rd', '4th'];
const ordinal = (p: number) => ORD[p] ?? (p > 4 ? `${p - 4 > 1 ? p - 4 : ''}OT` : `${p}th`);
const clockSec = (d: string | null) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(d ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function prepare(body: Json): SynthGame | null {
  const comp = body?.header?.competitions?.[0];
  if (!comp) return null;
  const plays = normalizeSummaryPlays(body).filter((p) => p.wallclock !== null);
  if (!plays.length) return null;
  plays.sort((a, b) => a.wallclock! - b.wallclock! || a.seq - b.seq);
  const side = (ha: string): TeamSnap => {
    const c = (comp.competitors ?? []).find((x: Json) => x?.homeAway === ha) ?? {};
    return { id: String(c?.team?.id ?? c?.id ?? ''), abbr: c?.team?.abbreviation ?? '?', name: c?.team?.shortDisplayName ?? c?.team?.displayName ?? '?', score: 0 };
  };
  const rawEnd = new Map<string, Json>();
  for (const d of body?.drives?.previous ?? []) for (const p of d?.plays ?? []) rawEnd.set(String(p.id), p.end);
  for (const p of body?.drives?.current?.plays ?? []) rawEnd.set(String(p.id), p.end);
  const home = side('home');
  const away = side('away');
  const networks = networksOf(comp).length ? networksOf(comp) : networksOf({ geoBroadcasts: body?.broadcasts ?? [] });
  return {
    id: String(body?.header?.id ?? comp.id),
    shortName: `${away.abbr} @ ${home.abbr}`,
    name: `${away.name} at ${home.name}`,
    start: Date.parse(comp.date ?? body?.header?.competitions?.[0]?.date ?? '') || plays[0].wallclock! - 10 * 60_000,
    home,
    away,
    networks,
    plays,
    rawEnd,
    finalDetail: comp?.status?.type?.shortDetail ?? 'Final',
  };
}

function snapshotAt(g: SynthGame, visible: number, t: number, delayMs: number): GameSnapshot {
  const base = { id: g.id, shortName: g.shortName, name: g.name, startTime: new Date(g.start).toISOString(), networks: g.networks, observedAt: t };
  const last = visible > 0 ? g.plays[visible - 1] : null;
  const home = { ...g.home, score: last?.homeScore ?? 0 };
  const away = { ...g.away, score: last?.awayScore ?? 0 };
  if (!last) {
    return { ...base, phase: 'PRE', statusName: 'STATUS_SCHEDULED', detail: new Date(g.start).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), period: 0, clockSec: null, displayClock: null, endOfPeriod: false, home, away, situation: null };
  }
  const done = visible === g.plays.length && t - delayMs > last.wallclock! + 120_000;
  if (done) return { ...base, phase: 'FINAL', statusName: 'STATUS_FINAL', detail: g.finalDetail, period: last.period, clockSec: 0, displayClock: '0:00', endOfPeriod: false, home, away, situation: null };
  const period = last.period ?? 1;
  if (last.kind === 'endPeriod' && period === 2) {
    return { ...base, phase: 'HALFTIME', statusName: 'STATUS_HALFTIME', detail: 'Halftime', period: 2, clockSec: 0, displayClock: '0:00', endOfPeriod: false, home, away, situation: null };
  }
  const endOfPeriod = last.kind === 'endPeriod';
  const cs = endOfPeriod ? 0 : clockSec(last.displayClock);
  const end = g.rawEnd.get(last.id) ?? {};
  const ytg = typeof end?.yardsToEndzone === 'number' ? end.yardsToEndzone : null;
  const down = typeof end?.down === 'number' && end.down > 0 ? end.down : null;
  const situation: Situation = {
    possessionTeamId: end?.team?.id != null ? String(end.team.id) : null,
    down,
    distance: down !== null && typeof end?.distance === 'number' ? end.distance : null,
    yardsToEndzone: ytg,
    downDistanceText: end?.downDistanceText ?? null,
    possessionText: end?.possessionText ?? null,
    isRedZone: down !== null && ytg !== null && ytg > 0 && ytg <= 20,
    redZoneSource: ytg !== null ? 'derived' : 'none',
    homeTimeouts: null,
    awayTimeouts: null,
    lastPlay: { id: last.id, typeText: last.typeText, text: last.text, scoreValue: last.scoreValue },
  };
  return {
    ...base,
    phase: 'LIVE',
    statusName: endOfPeriod ? 'STATUS_END_PERIOD' : 'STATUS_IN_PROGRESS',
    detail: endOfPeriod ? `End of ${ordinal(period)}` : `${last.displayClock ?? ''} - ${ordinal(period)}`,
    period,
    clockSec: cs,
    displayClock: endOfPeriod ? '0:00' : last.displayClock,
    endOfPeriod,
    home,
    away,
    situation,
  };
}

/** Generate scoreboard snapshots and play-by-play for a whole day, in time order. */
export function* synthesizeDay(finalBodies: unknown[], opts: SynthOptions): Generator<SynthEvent> {
  const games = finalBodies.map(prepare).filter((g): g is SynthGame => g !== null);
  if (!games.length) return;
  const delayMs = opts.dataDelaySeconds * 1000;
  const sbEvery = (opts.scoreboardEverySeconds ?? 12) * 1000;
  const pbpEvery = (opts.summaryEverySeconds ?? 15) * 1000;
  const startAt = Math.min(...games.map((g) => g.start)) - 5 * 60_000;
  const endAt = Math.max(...games.map((g) => g.plays.at(-1)!.wallclock!)) + delayMs + 5 * 60_000;
  const visible = new Map(games.map((g) => [g.id, 0]));
  let nextPbp = startAt;

  for (let t = startAt; t <= endAt; t += sbEvery) {
    for (const g of games) {
      let v = visible.get(g.id)!;
      while (v < g.plays.length && g.plays[v].wallclock! <= t - delayMs) v++;
      visible.set(g.id, v);
    }
    yield { at: t, kind: 'snapshots', snaps: games.map((g) => snapshotAt(g, visible.get(g.id)!, t, delayMs)) };
    if (t >= nextPbp) {
      nextPbp = t + pbpEvery;
      for (const g of games) {
        const v = visible.get(g.id)!;
        if (v > 0 && v <= g.plays.length && t - delayMs <= g.plays.at(-1)!.wallclock! + 180_000) yield { at: t, kind: 'plays', gameId: g.id, plays: g.plays.slice(0, v) };
      }
    }
  }
}
