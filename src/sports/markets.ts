import type { SportId } from '../engine/types';

// TV markets → the teams whose regional broadcasts they get. Sunday-afternoon NFL games on CBS and
// FOX are regional: three or four air at once and your local station shows one, usually your market's
// team. ESPN marks them all "national", so the market is how RedZone knows which one your CBS shows.
// Abbreviations are ESPN's.

export const MARKETS: Record<string, Partial<Record<SportId, string[]>>> = {
  Boston: { nfl: ['NE'] },
  'New York': { nfl: ['NYG', 'NYJ'] },
  Philadelphia: { nfl: ['PHI'] },
  Washington: { nfl: ['WSH'] },
  Baltimore: { nfl: ['BAL'] },
  Pittsburgh: { nfl: ['PIT'] },
  Cleveland: { nfl: ['CLE'] },
  Cincinnati: { nfl: ['CIN'] },
  Buffalo: { nfl: ['BUF'] },
  Miami: { nfl: ['MIA'] },
  Tampa: { nfl: ['TB'] },
  Jacksonville: { nfl: ['JAX'] },
  Atlanta: { nfl: ['ATL'] },
  Charlotte: { nfl: ['CAR'] },
  'New Orleans': { nfl: ['NO'] },
  Nashville: { nfl: ['TEN'] },
  Indianapolis: { nfl: ['IND'] },
  Houston: { nfl: ['HOU'] },
  Dallas: { nfl: ['DAL'] },
  'Kansas City': { nfl: ['KC'] },
  Denver: { nfl: ['DEN'] },
  'Las Vegas': { nfl: ['LV'] },
  'Los Angeles': { nfl: ['LAR', 'LAC'] },
  'San Francisco': { nfl: ['SF'] },
  Seattle: { nfl: ['SEA'] },
  Phoenix: { nfl: ['ARI'] },
  Minneapolis: { nfl: ['MIN'] },
  Chicago: { nfl: ['CHI'] },
  Detroit: { nfl: ['DET'] },
  'Green Bay': { nfl: ['GB'] },
  Milwaukee: { nfl: ['GB'] },
};

export function marketTeams(market: string, sport: SportId): string[] {
  const m = Object.entries(MARKETS).find(([k]) => k.toLowerCase() === market.trim().toLowerCase());
  return m?.[1][sport] ?? [];
}
