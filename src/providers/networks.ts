import type { Config } from '../config';
import type { SportId } from '../engine/types';
import type { DiscoveredChannel } from './types';

// The networks that carry the sports RedZone follows, with the names ESPN uses for them (`espnNames`,
// which become the lineup's `aliases`), the ways a TV guide tends to label them (`guideNames`, already
// normalized) and the station call signs they go by (`callSigns`). A lineup scan matches every guide
// row against this table. Call signs win over names: Comcast's channel map labels ESPN, ESPN2 and
// ESPNews all as "ESPN" (their parent network) and only the call signs tell them apart.
// Regional sports networks are listed by the names ESPN gives them (best effort: a missing one can be
// mapped by hand in Settings → TV service → Channels).

export interface Network {
  /** Lineup key (same keys as `channels` in config/redzone.config.json5). */
  key: string;
  espnNames: string[];
  guideNames: string[];
  /** Upper-case call signs (local stations vary by market, so broadcast networks have none). */
  callSigns: string[];
  /** Sports it carries (for setup's "networks found" lists). */
  sports: readonly SportId[];
  /** A regional sports network: most lineups have one or two, so a missing one isn't worth listing. */
  regional?: boolean;
}
/** @deprecated name from when every network carried college football. */
export type CfbNetwork = Network;

const ALL: readonly SportId[] = ['cfb', 'nfl', 'mcbb', 'nba', 'nhl', 'mlb', 'wcbb', 'wnba', 'mls', 'epl', 'ucl', 'laliga', 'atp', 'wta'];
const TENNIS: readonly SportId[] = ['atp', 'wta'];
const COLLEGE: readonly SportId[] = ['cfb', 'mcbb', 'wcbb'];
const SOCCER: readonly SportId[] = ['mls', 'epl', 'ucl', 'laliga'];
const net = (key: string, espnNames: string[], guideNames: string[], callSigns: string[], sports: readonly SportId[]): Network => ({ key, espnNames, guideNames, callSigns, sports });

export const NETWORKS: Network[] = [
  { key: 'ESPN', espnNames: ['ESPN'], guideNames: ['espn'], callSigns: ['ESPN', 'ESPND', 'ESPNHD'], sports: ALL },
  { key: 'ESPN2', espnNames: ['ESPN2'], guideNames: ['espn2', 'espn 2'], callSigns: ['ESPN2', 'ES2HD', 'ESPN2HD', 'ES2'], sports: ALL },
  { key: 'ESPNU', espnNames: ['ESPNU'], guideNames: ['espnu', 'espn u'], callSigns: ['ESPNU', 'ESPNUHD', 'ESPUHD'], sports: COLLEGE },
  { key: 'ESPNews', espnNames: ['ESPNEWS', 'ESPNews'], guideNames: ['espnews', 'espn news'], callSigns: ['ESPNN', 'ESPNEWS', 'ESNHD', 'ESPNNHD'], sports: COLLEGE },
  { key: 'ABC', espnNames: ['ABC'], guideNames: ['abc'], callSigns: [], sports: ALL },
  { key: 'CBS', espnNames: ['CBS'], guideNames: ['cbs'], callSigns: [], sports: ALL },
  { key: 'NBC', espnNames: ['NBC'], guideNames: ['nbc'], callSigns: [], sports: ALL },
  { key: 'FOX', espnNames: ['FOX', 'Fox'], guideNames: ['fox'], callSigns: [], sports: ALL },
  { key: 'FS1', espnNames: ['FS1'], guideNames: ['fs1', 'fox sports 1', 'fox sports1'], callSigns: ['FS1', 'FS1HD', 'FS1D'], sports: ALL },
  { key: 'FS2', espnNames: ['FS2'], guideNames: ['fs2', 'fox sports 2', 'fox sports2'], callSigns: ['FS2', 'FS2HD'], sports: ALL },
  { key: 'SEC Network', espnNames: ['SEC Network', 'SECN'], guideNames: ['sec', 'secn'], callSigns: ['SECN', 'SECND', 'SECHD', 'SEC'], sports: COLLEGE },
  { key: 'ACC Network', espnNames: ['ACC Network', 'ACCN'], guideNames: ['acc', 'accn'], callSigns: ['ACCN', 'ACCHD', 'ACCND'], sports: COLLEGE },
  { key: 'Big Ten Network', espnNames: ['Big Ten Network', 'BTN'], guideNames: ['big ten', 'btn', 'b1g'], callSigns: ['BTN', 'BTNHD', 'BIGTEN'], sports: COLLEGE },
  { key: 'CBS Sports Network', espnNames: ['CBS Sports Network', 'CBSSN'], guideNames: ['cbs sports', 'cbssn'], callSigns: ['CBSSN', 'CBSSD', 'CBSSNHD', 'CBSSHD'], sports: [...COLLEGE, 'wnba', 'ucl'] },
  { key: 'The CW', espnNames: ['The CW', 'CW'], guideNames: ['cw'], callSigns: [], sports: ['cfb'] },
  { key: 'TNT', espnNames: ['TNT'], guideNames: ['tnt'], callSigns: ['TNT', 'TNTHD'], sports: ALL },
  { key: 'truTV', espnNames: ['truTV', 'TruTV'], guideNames: ['trutv', 'tru tv'], callSigns: ['TRUTV', 'TRTVD', 'TRUHD', 'TRTV'], sports: ALL },
  { key: 'USA Network', espnNames: ['USA Network', 'USA Net', 'USA'], guideNames: ['usa'], callSigns: ['USA', 'USAHD', 'USAN'], sports: ['cfb', 'epl', 'mcbb'] },
  // National networks of the pro leagues
  net('NFL Network', ['NFL Net', 'NFL Network', 'NFLN'], ['nfl'], ['NFLNET', 'NFLHD', 'NFLN'], ['nfl']),
  net('NBA TV', ['NBA TV', 'NBATV'], ['nba tv', 'nbatv'], ['NBAHD', 'NBATV'], ['nba', 'wnba']),
  net('NHL Network', ['NHL Net', 'NHL Network', 'NHLN'], ['nhl'], ['NHL', 'NHLHD', 'NHLN'], ['nhl']),
  net('MLB Network', ['MLB Net', 'MLB Network', 'MLBN'], ['mlb'], ['MLBN', 'MLBHD'], ['mlb']),
  net('TBS', ['TBS'], ['tbs'], ['TBS', 'TBSHD'], ['mlb', 'nhl', 'mcbb']),
  net('Tennis Channel', ['Tennis Channel', 'TENNIS', 'Tennis Channel 2'], ['tennis channel', 'tennis'], ['TNND', 'TENNS', 'TENIS', 'TENNHD'], TENNIS),
  net('ION', ['ION'], ['ion'], [], ['wnba']),
  // Spanish-language networks (soccer, some NFL/MLB)
  net('Telemundo', ['Telemundo'], ['telemundo'], [], SOCCER),
  net('Universo', ['Universo'], ['universo'], ['UNIVSO', 'UVSOHD'], SOCCER),
  net('Univision', ['Univision'], ['univision'], [], SOCCER),
  net('UniMas', ['UniMas', 'UniMás'], ['unimas'], [], SOCCER),
  net('TUDN', ['TUDN'], ['tudn'], ['TUDN', 'TUDNHD'], SOCCER),
  net('ESPN Deportes', ['ESPN Deportes'], ['espn deportes'], ['ESPND+', 'ESPNDEP', 'ESPDHD'], SOCCER),
  net('Fox Deportes', ['Fox Deportes', 'FOX Deportes'], ['fox deportes'], ['FOXDE', 'FXDED'], [...SOCCER, 'mlb', 'nfl']),
  // Regional sports networks (NBA, NHL, MLB local games): see REGIONAL below
  net('NESN', ['NESN'], ['nesn'], ['NESN', 'NESND'], ['nhl', 'mlb']),
  net('NESN+', ['NESN+', 'NESNplus'], ['nesn+', 'nesn plus'], ['NESN+'], ['nhl', 'mlb']),
  net('NBC Sports Boston', ['NBC Sports Boston', 'NBCS Boston', 'NBCSB', 'NBCS-BOS', 'NBC Sports BOS'], ['nbc sports boston', 'nbc sports regional'], ['NBCSB', 'NBSBH'], ['nba']),
  net('NBC Sports Bay Area', ['NBC Sports BA', 'NBC Sports Bay Area', 'NBCS-BA', 'NBCSBA'], ['nbc sports bay area'], ['NBCSBA', 'CSNBA'], ['nba', 'nhl', 'mlb']),
  net('NBC Sports California', ['NBC Sports CA', 'NBC Sports California', 'NBCS-CA'], ['nbc sports california'], ['NBCSCA', 'CSNCA'], ['nba', 'mlb']),
  net('NBC Sports Philadelphia', ['NBC Sports Phil', 'NBC Sports Philadelphia', 'NBCS-PHI', 'NBCSP'], ['nbc sports philadelphia'], ['NBCSP', 'CSNPHL'], ['nba', 'nhl', 'mlb']),
  net('NBC Sports Chicago', ['NBC Sports Chicago', 'NBCS-CHI'], ['nbc sports chicago'], ['NBCSCH'], ['nba', 'nhl', 'mlb']),
  net('YES Network', ['YES', 'YES Network'], ['yes'], ['YES', 'YESHD'], ['mlb', 'nba']),
  net('SNY', ['SNY'], ['sny'], ['SNY', 'SNYHD'], ['mlb']),
  net('MSG', ['MSG'], ['msg'], ['MSG', 'MSGHD'], ['nba', 'nhl']),
  net('MSG Sportsnet', ['MSGSN', 'MSG Sportsnet', 'MSG2', 'MSGB'], ['msg sportsnet', 'msg 2', 'msg2'], ['MSG2', 'MSGSN', 'MSGPL'], ['nhl', 'nba']),
  net('MASN', ['MASN', 'MASN2'], ['masn'], ['MASN', 'MASNHD', 'MASN2'], ['mlb']),
  net('Marquee Sports Network', ['Marquee Sports Net', 'Marquee', 'Marquee Sports Network'], ['marquee sports', 'marquee'], ['MARQ', 'MARQHD'], ['mlb']),
  net('Monumental Sports Network', ['MNMT', 'Monumental Sports Network', 'MNMT2'], ['monumental sports', 'monumental'], ['MNMT', 'MNMTHD'], ['nba', 'nhl', 'wnba']),
  net('Chicago Sports Network', ['CHSN', 'Chicago Sports Network'], ['chicago sports'], ['CHSN', 'CHSNHD'], ['nba', 'nhl', 'mlb']),
  net('Space City Home Network', ['SCHN', 'Space City Home Network'], ['space city'], ['SCHN', 'SCHNHD'], ['nba', 'mlb']),
  net('ROOT Sports', ['ROOT SPORTS', 'Root Sports', 'ROOT Sports NW'], ['root sports'], ['ROOT', 'ROOTHD'], ['mlb', 'nhl']),
  net('FanDuel Sports Network', ['FanDuel SN', 'FDSN', 'FanDuel Sports Network'], ['fanduel sports'], [], ['nba', 'nhl', 'mlb']),
  net('Altitude', ['Altitude', 'ALT'], ['altitude'], ['ALT', 'ALTHD'], ['nba', 'nhl']),
  net('Sportsnet', ['Sportsnet', 'SN', 'SN1'], ['sportsnet'], [], ['nhl', 'mlb']),
];

const REGIONAL_FROM = NETWORKS.findIndex((n) => n.key === 'NESN');
for (let i = REGIONAL_FROM; i < NETWORKS.length; i++) NETWORKS[i].regional = true;

/** The networks that carry college football (the lineup before other sports). */
export const CFB_NETWORKS: Network[] = NETWORKS.filter((n) => n.sports.includes('cfb'));

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

/** How well a guide row matches a network: 5 its call sign, 4 affiliate call sign, 3 exact name, 2 name first, 1 name anywhere. */
function score(ch: DiscoveredChannel, norm: string, net: Network, affiliate: string | undefined): number {
  if (ch.callSign && net.callSigns.includes(ch.callSign.trim().toUpperCase())) return 5;
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
 * Turn the rows of a guide scan into lineup channels. Every network in NETWORKS gets an entry
 * (`number: null` when the guide doesn't have it). Each guide row counts for at most one network (its
 * best match), so "ESPN 2" can't also be taken for ESPN. When a network matches several rows, the
 * best match wins, then an HD row, then the lowest real channel number (mirrored ranges like 849 /
 * 1205 / 11205), then the first in guide order. Services without channel numbers
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
    for (const net of NETWORKS) {
      const s = score(row.f, row.norm, net, localAffiliates[net.key]);
      if (s > 0 && (!best || s > best.score)) best = { key: net.key, score: s };
    }
    if (best) picks.set(best.key, [...(picks.get(best.key) ?? []), { row, score: best.score }]);
  }

  const out: Config['channels'] = {};
  for (const net of NETWORKS) {
    const real = (r: (typeof rows)[number]) => (r.f.number && r.f.number > 0 ? r.f.number : Number.POSITIVE_INFINITY);
    const cands = (picks.get(net.key) ?? []).sort((a, b) => b.score - a.score || Number(b.row.hd) - Number(a.row.hd) || real(a.row) - real(b.row) || a.row.i - b.row.i);
    const hit = cands[0]?.row;
    out[net.key] = hit
      ? { number: hit.number, ...(hit.f.callSign ? { callSign: hit.f.callSign } : {}), ...(hit.f.ref ? { ref: hit.f.ref } : {}), aliases: net.espnNames }
      : { number: null, aliases: net.espnNames };
  }
  return out;
}
