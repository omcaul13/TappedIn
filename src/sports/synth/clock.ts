import type { GameSnapshot, LiveDetail, PlaySnap, SportId, TeamSnap } from '../../engine/types';
import { networksOf, type Json } from '../../espn/json';
import type { SynthAdapter, SynthGame } from './types';

// Day synthesis for sports with a game clock and top-level play-by-play (basketball, hockey): the
// scoreboard at any moment is the score, period and clock of the last published play, with the
// period breaks and halftime/intermissions those plays imply.

export interface ClockSynthOptions {
  plays(body: Json): PlaySnap[];
  /** "2nd", "2nd Half", "3rd" as ESPN writes it in the status detail. */
  periodName(period: number): string;
  /** Periods whose end is halftime / an intermission (the reel plays). */
  intermissionAfter: readonly number[];
  /** Play clocks count up from 0:00 (hockey) in periods this long; the scoreboard shows time left. */
  elapsedClockPeriodSeconds?: number;
  /** The live situation the scoreboard would show (power play…), if the plays tell. */
  live?(last: PlaySnap, plays: PlaySnap[], visible: number): LiveDetail | null;
}

const side = (comp: Json, ha: string): TeamSnap => {
  const c = (comp.competitors ?? []).find((x: Json) => x?.homeAway === ha) ?? {};
  return { id: String(c?.team?.id ?? c?.id ?? ''), abbr: c?.team?.abbreviation ?? '?', name: c?.team?.shortDisplayName ?? c?.team?.displayName ?? '?', score: 0 };
};

export function clockSynth(o: ClockSynthOptions): SynthAdapter {
  const prepare = (body: Json, sport: SportId): SynthGame | null => {
    const comp = body?.header?.competitions?.[0];
    if (!comp) return null;
    const plays = o.plays(body).filter((p) => p.wallclock !== null);
    if (!plays.length) return null;
    plays.sort((a, b) => a.wallclock! - b.wallclock! || a.seq - b.seq);
    const home = side(comp, 'home');
    const away = side(comp, 'away');
    const networks = networksOf(comp).length ? networksOf(comp) : networksOf({ geoBroadcasts: body?.broadcasts ?? [] });
    return {
      id: String(body?.header?.id ?? comp.id),
      sport,
      shortName: `${away.abbr} @ ${home.abbr}`,
      name: `${away.name} at ${home.name}`,
      start: Date.parse(comp.date ?? '') || plays[0].wallclock! - 10 * 60_000,
      home,
      away,
      networks,
      plays,
      finalDetail: comp?.status?.type?.shortDetail ?? 'Final',
    };
  };

  const snapshot = (g: SynthGame, visible: number, t: number, delayMs: number): GameSnapshot => {
    const base = { id: g.id, sport: g.sport, shortName: g.shortName, name: g.name, startTime: new Date(g.start).toISOString(), networks: g.networks, observedAt: t, situation: null };
    // Scores: the latest play that carries them (some plays, e.g. substitutions, have none).
    let homeScore = 0;
    let awayScore = 0;
    for (let i = visible - 1; i >= 0; i--) {
      if (g.plays[i].homeScore !== null) {
        homeScore = g.plays[i].homeScore!;
        awayScore = g.plays[i].awayScore ?? 0;
        break;
      }
    }
    const home = { ...g.home, score: homeScore };
    const away = { ...g.away, score: awayScore };
    // The game state is the last action play: substitutions and reviews (admin) during a break don't end it.
    let li = visible - 1;
    while (li > 0 && g.plays[li].kind === 'admin') li--;
    const last = visible > 0 ? g.plays[li] : null;
    if (!last) {
      return { ...base, phase: 'PRE', statusName: 'STATUS_SCHEDULED', detail: new Date(g.start).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), period: 0, clockSec: null, displayClock: null, endOfPeriod: false, home, away };
    }
    const done = visible === g.plays.length && t - delayMs > last.wallclock! + 120_000;
    if (done) return { ...base, phase: 'FINAL', statusName: 'STATUS_FINAL', detail: g.finalDetail, period: last.period, clockSec: 0, displayClock: '0:00', endOfPeriod: false, home, away };
    const period = last.period ?? 1;
    const ended = last.kind === 'endPeriod';
    if (ended && o.intermissionAfter.includes(period)) {
      return { ...base, phase: 'HALFTIME', statusName: 'STATUS_HALFTIME', detail: o.intermissionAfter.length > 1 ? `End of ${o.periodName(period)}` : 'Halftime', period, clockSec: 0, displayClock: '0:00', endOfPeriod: false, home, away };
    }
    const m = /^(\d{1,2}):(\d{2})/.exec(last.displayClock ?? '');
    const tenths = /^(\d{1,2})\.\d$/.exec(last.displayClock ?? ''); // "39.8": under a minute left
    const raw = m ? Number(m[1]) * 60 + Number(m[2]) : tenths ? Number(tenths[1]) : null;
    const len = o.elapsedClockPeriodSeconds;
    const clockSec = ended ? 0 : raw === null ? null : len ? Math.max(0, len - raw) : raw;
    const shown = clockSec === null ? (last.displayClock ?? '') : `${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, '0')}`;
    const snap: GameSnapshot = {
      ...base,
      phase: 'LIVE',
      statusName: ended ? 'STATUS_END_PERIOD' : 'STATUS_IN_PROGRESS',
      detail: ended ? `End of ${o.periodName(period)}` : `${shown} - ${o.periodName(period)}`,
      period,
      clockSec,
      displayClock: ended ? '0:00' : shown,
      endOfPeriod: ended,
      home,
      away,
    };
    const live = o.live?.(last, g.plays, visible);
    if (live) snap.live = live;
    return snap;
  };

  return { prepare, snapshot };
}

const ORD = ['', '1st', '2nd', '3rd', '4th'];
/** "1st".."4th", then "OT", "2OT"… after `regulation` periods. */
export function ordinalPeriod(p: number, regulation: number): string {
  if (p <= regulation) return ORD[p] ?? `${p}th`;
  const ot = p - regulation;
  return ot === 1 ? 'OT' : `${ot}OT`;
}
