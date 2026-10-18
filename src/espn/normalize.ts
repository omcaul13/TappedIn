// ESPN JSON → engine types. ESPN's endpoints are unofficial, so every field is treated as optional
// and anything unrecognised degrades to "unknown" rather than throwing. The sport-specific parts
// (phases, live situation, play-by-play) come from each sport's module in src/sports/.

import type { GameSnapshot, SportId } from '../engine/types';
import { sportOf } from '../sports';
import { categorizeFootball, classifyFootballPlay, footballPhase, footballSummaryPlays, normalizeFootballPlay, yardsToEndzoneFrom } from '../sports/football';
import { clockSeconds, networksOf, str, team, num, type Json } from './json';

export { networksOf } from './json';
export { yardsToEndzoneFrom };
/** Football's phase rules (college football was the only sport before src/sports/). */
export const phaseOf = (statusName: string, state: string | null, detail: string) => footballPhase(statusName, state, detail);
export const classifyPlay = classifyFootballPlay;
export const normalizePlay = normalizeFootballPlay;
/** @deprecated use `sportOf(sport).summaryPlays`; kept for football callers. */
export const normalizeSummaryPlays = footballSummaryPlays;
export { categorizeFootball };

export function normalizeEvent(ev: Json, observedAt: number, sport: SportId = 'cfb'): GameSnapshot | null {
  if (ev?.id == null) return null;
  const mod = sportOf(sport);
  const comp = ev?.competitions?.[0] ?? {};
  const status = ev?.status ?? comp?.status ?? {};
  const statusName = str(status?.type?.name) ?? 'UNKNOWN';
  const detail = str(status?.type?.shortDetail) ?? str(status?.type?.detail) ?? '';
  const period = num(status?.period);
  const phase = mod.phaseOf(statusName, str(status?.type?.state), detail, period);
  const home = team(comp, 'home');
  const away = team(comp, 'away');
  const live = phase === 'LIVE' && comp?.situation ? mod.situationOf(comp.situation, home, away) : { situation: null, live: null };
  const snap: GameSnapshot = {
    id: String(ev.id),
    sport: mod.id,
    shortName: str(ev?.shortName) ?? `${away.abbr} @ ${home.abbr}`,
    name: str(ev?.name) ?? `${away.name} at ${home.name}`,
    startTime: str(ev?.date) ?? str(comp?.startDate),
    phase,
    statusName,
    detail,
    period,
    clockSec: clockSeconds(status),
    displayClock: str(status?.displayClock),
    endOfPeriod: mod.endOfPeriod(phase, statusName, detail),
    home,
    away,
    networks: networksOf(comp),
    situation: live.situation,
    observedAt,
  };
  if (live.live) snap.live = live.live;
  return snap;
}

export function normalizeScoreboard(body: Json, observedAt: number, sport: SportId = 'cfb'): GameSnapshot[] {
  const events: Json[] = Array.isArray(body?.events) ? body.events : [];
  return events.map((e) => normalizeEvent(e, observedAt, sport)).filter((g): g is GameSnapshot => g !== null);
}
