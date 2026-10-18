import type { SportId } from '../engine/types';
import { cfb } from './cfb';
import { mcbb, nba, wcbb, wnba } from './leagues';
import { nhl } from './hockey';
import { nfl } from './nfl';
import type { SportModule } from './types';

// Every sport the app knows, in the order the picker lists them. Adding a sport: write its module
// (see README "Adding a sport"), then list it here.

export const SPORTS: readonly SportModule[] = [cfb, nfl, mcbb, nba, nhl, wcbb, wnba];

const BY_ID = new Map<string, SportModule>(SPORTS.map((s) => [s.id, s]));

export const SPORT_IDS = SPORTS.map((s) => s.id) as SportId[];

export function isSportId(id: string): id is SportId {
  return BY_ID.has(id);
}

/** The module for a sport. Unknown ids (old data) fall back to college football, which is what all data was before. */
export function sportOf(id: string | null | undefined): SportModule {
  return (id && BY_ID.get(id)) || cfb;
}

export type { SportModule } from './types';
