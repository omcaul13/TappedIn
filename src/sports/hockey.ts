// NHL: ESPN parsing, stoppage categories and excitement.
//
// What ESPN's play-by-play shows (35+ games, 10/2026):
//  - every whistle is a "Stoppage" play whose text says why: "TV Timeout" (100% of them last 90 s+),
//    "Icing", "Off-side", "Goalie Stopped", "Puck in Netting"… (almost all under a minute);
//  - penalties are plays named for the infraction ("Tripping"); goals are "Goal";
//  - the 1st and 2nd intermissions (~18 min) are the halftime of hockey: the highlights reel plays;
//  - each play carries the strength for its team ("Power Play", "Shorthanded"), which is how a power
//    play shows up; pulled goalies are not marked (only "Empty Net" goals), so the late-game hot
//    moment is a one-goal game in the last minutes, when teams pull the goalie;
//  - play clocks count up from 0:00; the scoreboard counts down.

import type { RankedCandidate } from '../engine/ranker';
import type { GameSnapshot, LiveDetail, Phase, PlayKind, PlaySnap } from '../engine/types';
import { basePhase, num, str, type Json } from '../espn/json';
import { basketballCompare, periodBreaksFromScoreboard, preset, topLevelPlays } from './basketball';
import { normalizedScore } from './football';
import { clockSynth, ordinalPeriod } from './synth/clock';
import type { CategorizablePlay, Excitement, SportModule } from './types';

const PERIOD = 20 * 60;
const OT = 5 * 60;
const ACTION = /^(face ?off|shot|hit|giveaway|takeaway|blocked|missed|shootout)/i;

export function hockeyPhase(statusName: string, state: string | null, detail: string): Phase {
  const phase = basePhase(statusName, state);
  if (phase === 'LIVE' && (/intermission/i.test(detail) || /^end of (the )?(1st|2nd)/i.test(detail))) return 'HALFTIME';
  return phase;
}

export function classifyHockeyPlay(typeText: string, scoringPlay: boolean, scoreValue: number): PlayKind {
  const t = typeText.toLowerCase();
  if (/^(period end|end of game|shootout end|end of period)/.test(t)) return 'endPeriod';
  if (/^period start|^game start/.test(t)) return 'admin';
  if (t === 'goal' || scoringPlay || scoreValue > 0) return 'score';
  if (ACTION.test(typeText)) return 'snap';
  // Stoppages and penalties: the puck is dead.
  return 'timeout';
}

export const hockeySummaryPlays = (body: Json) => topLevelPlays(body, classifyHockeyPlay);

export const HOCKEY_CATEGORIES = ['tvTimeout', 'teamTimeout', 'endOfPeriod', 'review', 'injury', 'penalty', 'goal', 'whistle', 'ordinary'] as const;
const LABELS: Record<string, string> = {
  tvTimeout: 'TV timeout',
  teamTimeout: 'Timeout',
  endOfPeriod: 'End of regulation',
  review: 'Video review',
  injury: 'Injury',
  penalty: 'Penalty',
  goal: 'Goal',
  whistle: 'Whistle',
  ordinary: 'Stoppage',
};

export function categorizeHockey(p: CategorizablePlay): string | null {
  if (p.kind === 'endPeriod') return p.period === 1 || p.period === 2 || /game|shootout/i.test(p.typeText) ? null : 'endOfPeriod';
  if (p.kind === 'admin') return null;
  if (p.kind === 'score') return 'goal';
  if (p.kind === 'timeout') {
    if (!/^stoppage$/i.test(p.typeText)) return 'penalty';
    if (/tv timeout/i.test(p.text)) return 'tvTimeout';
    if (/^timeout/i.test(p.text)) return 'teamTimeout';
    if (/review|challenge/i.test(p.text)) return 'review';
    if (/injur/i.test(p.text)) return 'injury';
    return 'whistle';
  }
  return 'ordinary';
}

/** Power play from the latest play's strength ("Power Play" for its team, "Shorthanded" for the other). */
export function hockeyLiveFromPlays(plays: PlaySnap[], snap: GameSnapshot): LiveDetail | null {
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    if (!p.strength) continue;
    const other = p.teamId === snap.home.id ? snap.away.id : p.teamId === snap.away.id ? snap.home.id : null;
    const s = p.strength.toLowerCase();
    const strength = /power play/.test(s) ? 'pp' : /shorthand/.test(s) ? 'pp' : 'even';
    const advantageTeamId = /power play/.test(s) ? p.teamId : /shorthand/.test(s) ? other : null;
    const lp = plays[plays.length - 1];
    return { family: 'hockey', lastPlay: { id: lp.id, typeText: lp.typeText, text: lp.text, scoreValue: lp.scoreValue }, strength, advantageTeamId };
  }
  return null;
}

export function hockeyProgressSeconds(g: GameSnapshot): number {
  const period = g.period ?? 0;
  if (period <= 0) return 0;
  if (period <= 3) return (period - 1) * PERIOD + (PERIOD - Math.min(PERIOD, g.clockSec ?? PERIOD));
  return 3 * PERIOD + (period - 4) * OT + (OT - Math.min(OT, g.clockSec ?? OT));
}

export function hockeyExcitement(g: GameSnapshot): Excitement {
  const margin = Math.abs(g.home.score - g.away.score);
  const period = g.period ?? 0;
  const overtime = period > 3;
  const live = g.live?.family === 'hockey' ? g.live : null;
  const pp = live?.strength === 'pp';
  const lateOneGoal = period === 3 && margin === 1 && g.clockSec !== null && g.clockSec <= 150;
  const ppTeam = pp && live?.advantageTeamId ? (live.advantageTeamId === g.home.id ? g.home.abbr : g.away.abbr) : null;
  const hot = overtime
    ? { label: 'overtime', phrase: 'is in overtime' }
    : lateOneGoal
      ? { label: 'one-goal game, goalie likely pulled', phrase: 'is a one-goal game in the last minutes' }
      : pp
        ? { label: ppTeam ? `${ppTeam} power play` : 'power play', phrase: 'is on a power play' }
        : null;
  const bonus = overtime ? 25 : lateOneGoal ? 30 : pp ? 20 : 0;
  const score = normalizedScore(margin, 3, hockeyProgressSeconds(g) / (3 * PERIOD), bonus, false);
  const why = [hot?.label ?? null, `margin ${margin}`, g.detail].filter(Boolean).join(', ');
  return { score, hot, why };
}

const inference = periodBreaksFromScoreboard(2);

export const nhl: SportModule = {
  id: 'nhl',
  name: 'NHL',
  short: 'NHL',
  level: 'pro',
  family: 'hockey',
  espn: { path: 'hockey/nhl' },
  phaseOf: (statusName, state, detail) => hockeyPhase(statusName, state, detail),
  endOfPeriod: (phase, statusName, detail) => phase === 'LIVE' && (statusName === 'STATUS_END_PERIOD' || /^end of/i.test(detail)),
  situationOf: (s) => {
    const lp = s?.lastPlay;
    return { situation: null, live: { family: 'hockey', lastPlay: lp?.id != null ? { id: String(lp.id), typeText: str(lp?.type?.text) ?? '', text: str(lp?.text) ?? '', scoreValue: num(lp?.scoreValue) ?? 0 } : null, strength: null, advantageTeamId: null } };
  },
  summaryPlays: hockeySummaryPlays,
  classifyPlay: classifyHockeyPlay,
  // Intermissions are status-driven (HALFTIME); only the end of regulation (to overtime) is a break here.
  inferFirstSeen: inference.first,
  inferChange: inference.change,
  liveFromPlays: hockeyLiveFromPlays,
  breaks: {
    categories: HOCKEY_CATEGORIES,
    labels: LABELS,
    categorize: categorizeHockey,
    resumes: new Set<PlayKind>(['snap', 'score']),
    linger: new Set(['goal']),
    modelFile: 'config/break-models/nhl.json',
  },
  presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
  halftimeMaxSeconds: 1500,
  progressSeconds: hockeyProgressSeconds,
  excitement: hockeyExcitement,
  compare: (a: RankedCandidate, b: RankedCandidate) => basketballCompare(a, b),
  synth: clockSynth({
    plays: hockeySummaryPlays,
    periodName: (p) => (p === 5 ? 'SO' : ordinalPeriod(p, 3)),
    intermissionAfter: [1, 2],
    elapsedClockPeriodSeconds: (p) => (p <= 3 ? PERIOD : OT),
    live: (plays, g) => hockeyLiveFromPlays(plays, { home: g.home, away: g.away } as GameSnapshot),
  }),
};
