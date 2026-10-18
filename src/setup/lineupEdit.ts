import type { Config } from '../config';
import { matchLineup, NETWORKS, rowNumbers } from '../providers/networks';
import type { DiscoveredChannel } from '../providers/types';

// The settings page's channel mapping: which guide row carries each sports network.
// A lineup scan saves the guide rows next to the lineup (.state/lineups/<id>.scan.json), so a
// network can be pointed at any row, or marked "not in my lineup", without scanning again.

/** A scan's lineup plus which networks it found (missing: national ones only). Callers save it only when `found` isn't empty. */
export function lineupFromScan(rows: DiscoveredChannel[]): { lineup: Config['channels']; found: string[]; missing: string[] } {
  const lineup = matchLineup(rows);
  const found = NETWORKS.filter((n) => lineup[n.key]?.number !== null).map((n) => n.key);
  const missing = NETWORKS.filter((n) => !n.regional && lineup[n.key]?.number === null).map((n) => n.key);
  return { lineup, found, missing };
}

/** Point network `key` at guide row `rowIndex` (null: not in my lineup). Returns a new lineup. */
export function applyMapping(lineup: Config['channels'], rows: DiscoveredChannel[], key: string, rowIndex: number | null): Config['channels'] {
  const net = NETWORKS.find((n) => n.key === key);
  if (!net) throw new Error(`unknown network "${key}"`);
  const out = structuredClone(lineup);
  const aliases = lineup[key]?.aliases?.length ? lineup[key].aliases : net.espnNames;
  if (rowIndex === null) {
    out[key] = { number: null, aliases };
    return out;
  }
  const row = rows[rowIndex];
  if (!row) throw new Error(`no guide row ${rowIndex}`);
  out[key] = { number: rowNumbers(rows)[rowIndex], ...(row.callSign ? { callSign: row.callSign } : {}), ...(row.ref ? { ref: row.ref } : {}), aliases };
  return out;
}

/** Each network, with the guide row it's mapped to (matched by number), for the mapping table. */
export function mappingRows(lineup: Config['channels'], rows: DiscoveredChannel[]): { key: string; row: number | null; label: string | null; number: number | null }[] {
  const numbers = rowNumbers(rows);
  return NETWORKS.map((n) => {
    const number = lineup[n.key]?.number ?? null;
    const row = number === null ? -1 : numbers.indexOf(number);
    return { key: n.key, row: row >= 0 ? row : null, label: row >= 0 ? rows[row].label : null, number };
  });
}
