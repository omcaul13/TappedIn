// ESPN JSON → engine types. ESPN's endpoints are unofficial, so every field is treated as optional
// and anything unrecognised degrades to "unknown" rather than throwing.
//
// Quirks handled (all observed on 2026-10-17):
//  - "End of 3rd" arrives as STATUS_IN_PROGRESS            → LIVE + endOfPeriod
//  - halftime/final games still carry an old `situation`  → situation only kept while LIVE
//  - isRedZone=true with no down/distance (stale)          → red zone needs a down or a yard line
//  - the current drive's plays also appear in drives.previous → dedupe by id, sort by sequenceNumber
//  - play ids can be negative                              → ids are opaque strings
//  - network names like "ESPN/Disney+" come as separate names → list every name

import type { GameSnapshot, Phase, PlayKind, PlaySnap, Situation, TeamSnap } from '../engine/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length ? v.trim() : null);

/**
 * Network names from either shape ESPN uses: scoreboard `broadcasts[].names[]`, or
 * `{ type: { shortName: 'TV' }, media: { shortName } }` (scoreboard geoBroadcasts, summary header).
 */
export function networksOf(comp: Json): string[] {
  const names = new Set<string>();
  const addMedia = (g: Json) => {
    const type = g?.type?.shortName;
    if (type && type !== 'TV' && type !== 'Streaming') return; // radio etc.
    if (str(g?.media?.shortName)) names.add(str(g.media.shortName)!);
  };
  for (const b of comp?.broadcasts ?? []) {
    for (const n of b?.names ?? []) if (str(n)) names.add(str(n)!);
    addMedia(b);
  }
  for (const g of comp?.geoBroadcasts ?? []) addMedia(g);
  return [...names];
}

export function phaseOf(statusName: string, state: string | null, detail: string): Phase {
  let phase: Phase;
  switch (statusName) {
    case 'STATUS_SCHEDULED':
    case 'STATUS_PREGAME':
      phase = 'PRE';
      break;
    case 'STATUS_IN_PROGRESS':
    case 'STATUS_END_PERIOD':
    case 'STATUS_FIRST_HALF':
    case 'STATUS_SECOND_HALF':
    case 'STATUS_OVERTIME':
      phase = 'LIVE';
      break;
    case 'STATUS_HALFTIME':
      phase = 'HALFTIME';
      break;
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_OT':
    case 'STATUS_FULL_TIME':
      phase = 'FINAL';
      break;
    case 'STATUS_DELAYED':
    case 'STATUS_RAIN_DELAY':
    case 'STATUS_SUSPENDED':
      phase = 'DELAYED';
      break;
    case 'STATUS_POSTPONED':
      phase = 'POSTPONED';
      break;
    case 'STATUS_CANCELED':
    case 'STATUS_CANCELLED':
    case 'STATUS_FORFEIT':
      phase = 'CANCELED';
      break;
    default:
      phase = state === 'pre' ? 'PRE' : state === 'in' ? 'LIVE' : state === 'post' ? 'FINAL' : 'UNKNOWN';
  }
  if (phase === 'LIVE' && /halftime|^end of (the )?(2nd|second)/i.test(detail)) phase = 'HALFTIME';
  return phase;
}

function clockSeconds(status: Json): number | null {
  const c = num(status?.clock);
  if (c !== null) return c;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(status?.displayClock) ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function team(comp: Json, side: 'home' | 'away'): TeamSnap {
  const c = (comp?.competitors ?? []).find((x: Json) => x?.homeAway === side) ?? {};
  return {
    id: String(c?.team?.id ?? c?.id ?? ''),
    abbr: str(c?.team?.abbreviation) ?? '?',
    name: str(c?.team?.shortDisplayName) ?? str(c?.team?.displayName) ?? str(c?.team?.name) ?? '?',
    score: num(c?.score) ?? 0,
    color: hex(c?.team?.color),
    altColor: hex(c?.team?.alternateColor),
    // The UI is dark: ESPN's dark-background logo variant keeps navy/black logos visible.
    logo: str(c?.team?.logoDark) ?? str(c?.team?.logo) ?? null,
  };
}

const hex = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

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

function situationOf(s: Json, home: TeamSnap, away: TeamSnap): Situation {
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

export function normalizeEvent(ev: Json, observedAt: number): GameSnapshot | null {
  if (ev?.id == null) return null;
  const comp = ev?.competitions?.[0] ?? {};
  const status = ev?.status ?? comp?.status ?? {};
  const statusName = str(status?.type?.name) ?? 'UNKNOWN';
  const detail = str(status?.type?.shortDetail) ?? str(status?.type?.detail) ?? '';
  const phase = phaseOf(statusName, str(status?.type?.state), detail);
  const home = team(comp, 'home');
  const away = team(comp, 'away');
  return {
    id: String(ev.id),
    shortName: str(ev?.shortName) ?? `${away.abbr} @ ${home.abbr}`,
    name: str(ev?.name) ?? `${away.name} at ${home.name}`,
    startTime: str(ev?.date) ?? str(comp?.startDate),
    phase,
    statusName,
    detail,
    period: num(status?.period),
    clockSec: clockSeconds(status),
    displayClock: str(status?.displayClock),
    endOfPeriod: phase === 'LIVE' && (statusName === 'STATUS_END_PERIOD' || /^end of/i.test(detail)),
    home,
    away,
    networks: networksOf(comp),
    situation: phase === 'LIVE' && comp?.situation ? situationOf(comp.situation, home, away) : null,
    observedAt,
  };
}

export function normalizeScoreboard(body: Json, observedAt: number): GameSnapshot[] {
  const events: Json[] = Array.isArray(body?.events) ? body.events : [];
  return events.map((e) => normalizeEvent(e, observedAt)).filter((g): g is GameSnapshot => g !== null);
}

export function classifyPlay(typeText: string, scoringPlay: boolean, scoreValue: number): PlayKind {
  const t = typeText.toLowerCase();
  if (/end (period|of (the )?(half|game|regulation|quarter))|^end period/.test(t)) return 'endPeriod';
  if (/timeout/.test(t)) return 'timeout';
  if (/two[- ]minute|coin toss/.test(t)) return 'admin';
  if (/extra point|two[- ]point|2pt|conversion|\bpat\b/.test(t)) return 'pat';
  if (scoringPlay || scoreValue > 0 || /touchdown|field goal good|safety/.test(t)) return 'score';
  if (/kickoff/.test(t)) return 'kickoff';
  return 'snap';
}

export function normalizePlay(p: Json, index: number): PlaySnap | null {
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
    kind: classifyPlay(typeText, scoringPlay, scoreValue),
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
export function normalizeSummaryPlays(body: Json): PlaySnap[] {
  const raw: Json[] = [];
  for (const d of body?.drives?.previous ?? []) for (const p of d?.plays ?? []) raw.push(p);
  for (const p of body?.drives?.current?.plays ?? []) raw.push(p);
  const byId = new Map<string, PlaySnap>();
  raw.forEach((p, i) => {
    const n = normalizePlay(p, i);
    if (n) byId.set(n.id, n);
  });
  return [...byId.values()].sort((a, b) => a.seq - b.seq || (a.wallclock ?? 0) - (b.wallclock ?? 0));
}
