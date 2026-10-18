// Print today's slate with live situation data and whether each game is watchable with the
// current channel map.
//   npm run espn:probe                # today (ET)
//   npm run espn:probe -- 20261017    # a specific day
import { resolveChannel } from '../src/channels';
import { loadConfig } from '../src/config';
import { EspnClient, espnDateKey } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import type { GameSnapshot } from '../src/engine/types';

const cfg = loadConfig();
const client = new EspnClient(cfg.espn);
const date = process.argv[2] ?? espnDateKey();

const { body, fetchedAt } = await client.scoreboard(date);
const games = normalizeScoreboard(body, Date.parse(fetchedAt));

const order: Record<string, number> = { LIVE: 0, HALFTIME: 0, DELAYED: 0, PRE: 1, FINAL: 2 };
games.sort((a, b) => (order[a.phase] ?? 3) - (order[b.phase] ?? 3) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

const counts = games.reduce<Record<string, number>>((m, g) => ((m[g.phase] = (m[g.phase] ?? 0) + 1), m), {});
console.log(`ESPN scoreboard ${date} @ ${fetchedAt}: ${games.length} games`, counts);
console.log();

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const score = (g: GameSnapshot) => (g.phase === 'PRE' ? '' : `${g.away.abbr} ${g.away.score}-${g.home.score} ${g.home.abbr}`);

for (const g of games) {
  const avail = resolveChannel(cfg, g.networks);
  const watch = avail.available ? `▶ ${avail.channel} (${avail.number})` : `✕ ${avail.reason}`;
  const s = g.situation;
  const live = s
    ? [
        s.isRedZone ? `RED ZONE (${s.redZoneSource})` : '',
        s.downDistanceText ?? '',
        `TO ${s.awayTimeouts ?? '?'}/${s.homeTimeouts ?? '?'}`,
        s.lastPlay ? `last: ${s.lastPlay.typeText}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  console.log([g.id, pad(g.shortName, 14), pad(g.phase + (g.endOfPeriod ? '*' : ''), 9), pad(g.detail, 22), pad(score(g), 20), pad(g.networks.join('/'), 18), pad(watch, 34), live].join(' '));
}
