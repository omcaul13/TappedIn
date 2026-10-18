// Small readers for ESPN's unofficial JSON, shared by every sport's parser. Every field is treated
// as optional: anything missing or malformed comes back null rather than throwing.

import type { Phase, TeamSnap } from '../engine/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;

export const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length ? v.trim() : null);

export const hex = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

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

/** Phase from ESPN's status name alone (sports add their own rules on top, e.g. halftime from the detail text). */
export function basePhase(statusName: string, state: string | null): Phase {
  switch (statusName) {
    case 'STATUS_SCHEDULED':
    case 'STATUS_PREGAME':
      return 'PRE';
    case 'STATUS_IN_PROGRESS':
    case 'STATUS_END_PERIOD':
    case 'STATUS_FIRST_HALF':
    case 'STATUS_SECOND_HALF':
    case 'STATUS_OVERTIME':
      return 'LIVE';
    case 'STATUS_HALFTIME':
      return 'HALFTIME';
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_OT':
    case 'STATUS_FULL_TIME':
      return 'FINAL';
    case 'STATUS_DELAYED':
    case 'STATUS_RAIN_DELAY':
    case 'STATUS_SUSPENDED':
      return 'DELAYED';
    case 'STATUS_POSTPONED':
      return 'POSTPONED';
    case 'STATUS_CANCELED':
    case 'STATUS_CANCELLED':
    case 'STATUS_FORFEIT':
      return 'CANCELED';
    default:
      return state === 'pre' ? 'PRE' : state === 'in' ? 'LIVE' : state === 'post' ? 'FINAL' : 'UNKNOWN';
  }
}

export function clockSeconds(status: Json): number | null {
  const c = num(status?.clock);
  if (c !== null) return c;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(status?.displayClock) ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function team(comp: Json, side: 'home' | 'away'): TeamSnap {
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
