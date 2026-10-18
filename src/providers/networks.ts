import type { Config } from '../config';
import type { DiscoveredChannel } from './types';

// The networks that carry college football, with the names ESPN uses for them (`espnNames`, which
// become the lineup's `aliases`) and the ways a TV guide tends to label them (`guideNames`, already
// normalized). A lineup scan matches every guide row against this table.

export interface CfbNetwork {
  /** Lineup key (same keys as `channels` in config/redzone.config.json5). */
  key: string;
  espnNames: string[];
  guideNames: string[];
}

export const CFB_NETWORKS: CfbNetwork[] = [
  { key: 'ESPN', espnNames: ['ESPN'], guideNames: ['espn'] },
  { key: 'ESPN2', espnNames: ['ESPN2'], guideNames: ['espn2', 'espn 2'] },
  { key: 'ESPNU', espnNames: ['ESPNU'], guideNames: ['espnu', 'espn u'] },
  { key: 'ESPNews', espnNames: ['ESPNEWS', 'ESPNews'], guideNames: ['espnews', 'espn news'] },
  { key: 'ABC', espnNames: ['ABC'], guideNames: ['abc'] },
  { key: 'CBS', espnNames: ['CBS'], guideNames: ['cbs'] },
  { key: 'NBC', espnNames: ['NBC'], guideNames: ['nbc'] },
  { key: 'FOX', espnNames: ['FOX', 'Fox'], guideNames: ['fox'] },
  { key: 'FS1', espnNames: ['FS1'], guideNames: ['fs1', 'fox sports 1', 'fox sports1'] },
  { key: 'FS2', espnNames: ['FS2'], guideNames: ['fs2', 'fox sports 2', 'fox sports2'] },
  { key: 'SEC Network', espnNames: ['SEC Network', 'SECN'], guideNames: ['sec', 'secn'] },
  { key: 'ACC Network', espnNames: ['ACC Network', 'ACCN'], guideNames: ['acc', 'accn'] },
  { key: 'Big Ten Network', espnNames: ['Big Ten Network', 'BTN'], guideNames: ['big ten', 'btn', 'b1g'] },
  { key: 'CBS Sports Network', espnNames: ['CBS Sports Network', 'CBSSN'], guideNames: ['cbs sports', 'cbssn'] },
  { key: 'The CW', espnNames: ['The CW', 'CW'], guideNames: ['cw'] },
  { key: 'TNT', espnNames: ['TNT'], guideNames: ['tnt'] },
  { key: 'truTV', espnNames: ['truTV', 'TruTV'], guideNames: ['trutv', 'tru tv'] },
  { key: 'USA Network', espnNames: ['USA Network', 'USA Net', 'USA'], guideNames: ['usa'] },
];

/** Words dropped before matching: they decorate names without changing the network. */
const DROP = new Set(['hd', 'the', 'network', 'channel', 'east']);
/** A partial match containing one of these is a different channel (FOX News, ESPN Deportes, NBC Sports Boston…). */
const EXCLUDE = new Set(['news', 'business', 'deportes', 'espanol', 'latino', 'weather', 'sports', 'plus', 'classic', 'life', 'xtra', 'extra', 'kids']);

export function normalizeGuideName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .split(' ')
    .filter((w) => w && !DROP.has(w))
    .join(' ');
}

/** How well a guide row matches a network: 4 affiliate call sign, 3 exact name, 2 name first, 1 name anywhere. */
function score(ch: DiscoveredChannel, norm: string, net: CfbNetwork, affiliate: string | undefined): number {
  if (affiliate) {
    const a = affiliate.toLowerCase();
    if ((ch.callSign ?? '').toLowerCase().startsWith(a) || ch.label.trim().toLowerCase().split(/\s+/)[0]?.startsWith(a)) return 4;
  }
  let best = 0;
  const words = norm.split(' ');
  for (const g of net.guideNames) {
    if (norm === g) return 3;
    const gw = g.split(' ');
    if (words.some((w) => EXCLUDE.has(w) && !gw.includes(w))) continue;
    if (norm.startsWith(`${g} `)) best = Math.max(best, 2);
    else if (` ${norm} `.includes(` ${g} `)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Turn the rows of a guide scan into lineup channels. Every network in CFB_NETWORKS gets an entry
 * (`number: null` when the guide doesn't have it). Each guide row counts for at most one network (its
 * best match), so "ESPN 2" can't also be taken for ESPN. When a network matches several rows, the
 * best match wins, then an HD row, then the first in guide order. Services without channel numbers
 * get stable synthetic numbers in guide order. `localAffiliates` maps a network to the call sign of
 * the user's local station (e.g. { ABC: 'WCVB' }).
 */
/**
 * The engine channel number for each guide row: its own number, or (services without channel
 * numbers) a stable synthetic one after the highest real number, in guide order.
 */
export function rowNumbers(found: DiscoveredChannel[]): number[] {
  const real = found.map((f) => f.number).filter((n): n is number => n !== null && n > 0);
  const base = real.length ? Math.max(...real) : 0;
  return found.map((f, i) => (f.number && f.number > 0 ? f.number : base + i + 1));
}

export function matchLineup(found: DiscoveredChannel[], localAffiliates: Record<string, string> = {}): Config['channels'] {
  const numbers = rowNumbers(found);
  const rows = found.map((f, i) => ({ f, i, number: numbers[i], norm: normalizeGuideName(f.label), hd: /\bhd\b/i.test(f.label) }));

  const picks = new Map<string, { row: (typeof rows)[number]; score: number }[]>();
  for (const row of rows) {
    let best: { key: string; score: number } | null = null;
    for (const net of CFB_NETWORKS) {
      const s = score(row.f, row.norm, net, localAffiliates[net.key]);
      if (s > 0 && (!best || s > best.score)) best = { key: net.key, score: s };
    }
    if (best) picks.set(best.key, [...(picks.get(best.key) ?? []), { row, score: best.score }]);
  }

  const out: Config['channels'] = {};
  for (const net of CFB_NETWORKS) {
    const cands = (picks.get(net.key) ?? []).sort((a, b) => b.score - a.score || Number(b.row.hd) - Number(a.row.hd) || a.row.i - b.row.i);
    const hit = cands[0]?.row;
    out[net.key] = hit
      ? { number: hit.number, ...(hit.f.callSign ? { callSign: hit.f.callSign } : {}), ...(hit.f.ref ? { ref: hit.f.ref } : {}), aliases: net.espnNames }
      : { number: null, aliases: net.espnNames };
  }
  return out;
}
