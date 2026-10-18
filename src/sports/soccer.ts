// Soccer (MLS, Premier League, Champions League, La Liga): ESPN parsing, phases and excitement.
//
// Soccer broadcasts don't cut to commercials while the ball is in play, so a soccer screen never
// switches during play: only halftime (the reel), the break before extra time, and weather delays
// (ESPN's DELAYED status) take it away. Soccer games are good fill-in destinations for other sports'
// breaks: always live, never in a commercial.
//
// What ESPN's data shows (Sep–Oct 2026): the scoreboard clock counts up in seconds (2700 at halftime,
// "90'+4'" in stoppage time); the summary's `keyEvents` (kickoff, goals, cards, substitutions,
// "Halftime", "Start 2nd Half", "End Regular Time", "Start Delay"/"End Delay") carry wallclocks;
// goals don't carry the score, but their text does ("Goal! Everton 0, Chelsea 1.").

import type { RankedCandidate } from '../engine/ranker';
import type { GameSnapshot, Phase, PlayKind, PlaySnap, SportId, TeamSnap } from '../engine/types';
import { basePhase, networksOf, num, str, type Json } from '../espn/json';
import { basketballCompare, preset } from './basketball';
import { normalizedScore } from './football';
import type { SynthAdapter, SynthGame } from './synth/types';
import type { Excitement, SportModule } from './types';

const REGULATION = 90 * 60;

export function soccerPhase(statusName: string, state: string | null, detail: string): Phase {
  if (/HALFTIME|END_OF_REGULATION|END_OF_EXTRATIME|END_OF_EXTRA_TIME/.test(statusName) || /^(HT|halftime)$/i.test(detail)) return 'HALFTIME';
  if (/^STATUS_(FINAL|FULL)_?(PEN|AET|TIME)?$/.test(statusName) || /^STATUS_FINAL_PEN|^STATUS_FULL_PEN/.test(statusName)) return 'FINAL';
  if (/^STATUS_(FIRST_HALF|SECOND_HALF|EXTRA_TIME|OVERTIME|SHOOTOUT)/.test(statusName)) return 'LIVE';
  return basePhase(statusName, state);
}

export function classifySoccerEvent(typeText: string, scoringPlay: boolean): PlayKind {
  const t = typeText.toLowerCase();
  if (scoringPlay || /\bgoal\b/.test(t)) return t.includes('disallowed') ? 'admin' : 'score';
  if (/^(kickoff|start 2nd half|start extra time|start (1st|2nd) half extra time|end delay)/.test(t)) return 'snap';
  if (/^(halftime|end regular time|end (1st|2nd) half|end extra time|end of extra time|full time)/.test(t)) return 'endPeriod';
  if (/^start delay/.test(t)) return 'timeout';
  return 'admin';
}

/** The score after a goal, from its text ("Goal! Everton 0, Chelsea 1."): home first, as ESPN writes it. */
export function scoreFromGoalText(text: string): { home: number; away: number } | null {
  const m = [...text.matchAll(/\s(\d+)(?=[,.])/g)].map((x) => Number(x[1]));
  return m.length >= 2 ? { home: m[m.length - 2], away: m[m.length - 1] } : null;
}

export function soccerSummaryPlays(body: Json): PlaySnap[] {
  const out: PlaySnap[] = [];
  let home = 0;
  let away = 0;
  (body?.keyEvents ?? []).forEach((k: Json, i: number) => {
    if (k?.id == null) return;
    const typeText = str(k?.type?.text) ?? '';
    const text = str(k?.text) ?? '';
    const scoringPlay = k?.scoringPlay === true;
    const kind = classifySoccerEvent(typeText, scoringPlay);
    if (kind === 'score' && !k?.shootout) {
      const s = scoreFromGoalText(text);
      if (s) ({ home, away } = s);
    }
    const wc = str(k?.wallclock) ? Date.parse(k.wallclock) : NaN;
    out.push({
      id: String(k.id),
      seq: i,
      typeText,
      text,
      kind,
      period: num(k?.period?.number),
      displayClock: str(k?.clock?.displayValue),
      wallclock: Number.isFinite(wc) ? wc : null,
      scoringPlay,
      scoreValue: kind === 'score' ? 1 : 0,
      awayScore: away,
      homeScore: home,
      isTurnover: false,
      teamId: k?.team?.id != null ? String(k.team.id) : null,
      endYardsToEndzone: null,
      endTeamId: null,
    });
  });
  return out;
}

export function soccerProgressSeconds(g: GameSnapshot): number {
  return Math.max(0, g.clockSec ?? 0);
}

export function soccerExcitement(g: GameSnapshot): Excitement {
  const margin = Math.abs(g.home.score - g.away.score);
  const period = g.period ?? 0;
  const minute = Math.floor((g.clockSec ?? 0) / 60);
  const extra = period >= 3;
  const shootout = period >= 5 || /shootout|pens/i.test(g.statusName + g.detail);
  const stoppage = /\+/.test(g.displayClock ?? '') && period === 2;
  const live = g.phase === 'LIVE';
  const hot = !live
    ? null
    : shootout
      ? { label: 'penalty shootout', phrase: 'is in a penalty shootout' }
      : extra && margin <= 1
        ? { label: 'extra time', phrase: 'is in extra time' }
        : stoppage && margin <= 1
          ? { label: 'stoppage time', phrase: 'is in stoppage time' }
          : minute >= 75 && margin <= 1
            ? { label: margin === 0 ? 'level late' : 'one-goal game late', phrase: 'is close late' }
            : null;
  const bonus = shootout ? 30 : extra ? 25 : stoppage && margin <= 1 ? 25 : hot ? 15 : 0;
  const score = normalizedScore(margin, 3, Math.min(1, (g.clockSec ?? 0) / REGULATION), bonus, false);
  const why = [hot?.label ?? null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

// ---- synth ---------------------------------------------------------------------------------------

const side = (comp: Json, ha: string): TeamSnap => {
  const c = (comp.competitors ?? []).find((x: Json) => x?.homeAway === ha) ?? {};
  return { id: String(c?.team?.id ?? c?.id ?? ''), abbr: c?.team?.abbreviation ?? '?', name: c?.team?.shortDisplayName ?? c?.team?.displayName ?? '?', score: 0 };
};
const clockOf = (p: PlaySnap) => {
  const m = /^(\d+)'(?:\+(\d+)')?/.exec(p.displayClock ?? '');
  return m ? (Number(m[1]) + Number(m[2] ?? 0)) * 60 : null;
};

/** Soccer days rebuilt from keyEvents; the match clock runs on between events. */
export const soccerSynth: SynthAdapter = {
  prepare(body: Json, sport: SportId): SynthGame | null {
    const comp = body?.header?.competitions?.[0];
    if (!comp) return null;
    const plays = soccerSummaryPlays(body).filter((p) => p.wallclock !== null);
    if (!plays.length) return null;
    plays.sort((a, b) => a.wallclock! - b.wallclock! || a.seq - b.seq);
    const home = side(comp, 'home');
    const away = side(comp, 'away');
    return {
      id: String(body?.header?.id ?? comp.id),
      sport,
      shortName: `${away.abbr} @ ${home.abbr}`,
      name: `${away.name} at ${home.name}`,
      start: Date.parse(comp.date ?? '') || plays[0].wallclock! - 10 * 60_000,
      home,
      away,
      networks: networksOf(comp).length ? networksOf(comp) : networksOf({ geoBroadcasts: body?.broadcasts ?? [] }),
      plays,
      finalDetail: comp?.status?.type?.shortDetail ?? 'FT',
    };
  },
  snapshot(g, visible, t, delayMs) {
    const base = { id: g.id, sport: g.sport, shortName: g.shortName, name: g.name, startTime: new Date(g.start).toISOString(), networks: g.networks, observedAt: t, situation: null };
    const last = visible > 0 ? g.plays[visible - 1] : null;
    const home = { ...g.home, score: last?.homeScore ?? 0 };
    const away = { ...g.away, score: last?.awayScore ?? 0 };
    if (!last) return { ...base, phase: 'PRE', statusName: 'STATUS_SCHEDULED', detail: new Date(g.start).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), period: 0, clockSec: null, displayClock: null, endOfPeriod: false, home, away };
    const done = visible === g.plays.length && t - delayMs > last.wallclock! + 120_000;
    if (done) return { ...base, phase: 'FINAL', statusName: 'STATUS_FULL_TIME', detail: g.finalDetail, period: last.period, clockSec: REGULATION, displayClock: "90'", endOfPeriod: false, home, away };
    const period = last.period ?? 1;
    if (last.kind === 'endPeriod') return { ...base, phase: 'HALFTIME', statusName: 'STATUS_HALFTIME', detail: 'HT', period, clockSec: clockOf(last), displayClock: last.displayClock, endOfPeriod: false, home, away };
    // The clock keeps running between events, from the last event's minute.
    const since = Math.max(0, (t - delayMs - last.wallclock!) / 1000);
    const startOf = period === 1 ? 0 : period === 2 ? 45 * 60 : period === 3 ? REGULATION : 105 * 60;
    const clockSec = Math.round(Math.max(startOf, clockOf(last) ?? startOf) + since);
    const minute = Math.floor(clockSec / 60) + 1;
    const cap = period === 1 ? 45 : period === 2 ? 90 : period === 3 ? 105 : 120;
    const shown = minute > cap ? `${cap}'+${minute - cap}'` : `${minute}'`;
    return { ...base, phase: 'LIVE', statusName: period === 1 ? 'STATUS_FIRST_HALF' : period === 2 ? 'STATUS_SECOND_HALF' : 'STATUS_EXTRA_TIME', detail: shown, period, clockSec, displayClock: shown, endOfPeriod: false, home, away };
  },
};

// ---- one league ----------------------------------------------------------------------------------

export function soccerLeague(l: { id: SportId; name: string; short: string; path: string; query: string; channels: string[] }): SportModule {
  return {
    id: l.id,
    name: l.name,
    short: l.short,
    level: 'pro',
    family: 'soccer',
    espn: { path: l.path },
    phaseOf: (statusName, state, detail) => soccerPhase(statusName, state, detail),
    endOfPeriod: () => false,
    situationOf: () => ({ situation: null, live: null }),
    summaryPlays: soccerSummaryPlays,
    classifyPlay: (typeText, scoring) => classifySoccerEvent(typeText, scoring),
    breaks: {
      // No commercials while the ball is in play: nothing during play starts a break.
      categories: [],
      labels: {},
      categorize: () => null,
      resumes: new Set<PlayKind>(['snap', 'score']),
      linger: new Set(),
      ignore: (p) => p.kind === 'admin',
      modelFile: `config/break-models/${l.id}.json`,
    },
    presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.75, 90, false), high: preset(45, 0.65, 60, true) },
    halftimeMaxSeconds: 1500,
    progressSeconds: soccerProgressSeconds,
    excitement: soccerExcitement,
    compare: (a: RankedCandidate, b: RankedCandidate) => basketballCompare(a, b),
    synth: soccerSynth,
    highlights: { query: l.query, youtubeChannels: l.channels },
  };
}

export const mls = soccerLeague({ id: 'mls', name: 'MLS', short: 'MLS', path: 'soccer/usa.1', query: 'MLS', channels: ['Major League Soccer', 'FOX Soccer', 'FOX Sports'] });
export const epl = soccerLeague({ id: 'epl', name: 'Premier League', short: 'EPL', path: 'soccer/eng.1', query: 'Premier League', channels: ['NBC Sports', 'Premier League', 'Telemundo Deportes'] });
export const ucl = soccerLeague({ id: 'ucl', name: 'Champions League', short: 'UCL', path: 'soccer/uefa.champions', query: 'Champions League', channels: ['CBS Sports Golazo', 'UEFA', 'TUDN', 'Univision'] });
export const laliga = soccerLeague({ id: 'laliga', name: 'La Liga', short: 'LIGA', path: 'soccer/esp.1', query: 'LaLiga', channels: ['ESPN FC', 'LaLiga', 'ESPN Deportes'] });
