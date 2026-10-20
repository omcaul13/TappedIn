// Record a game day's ESPN data for replay/simulation and heuristic tuning.
//   npm run record                         # today's slate (ET), every enabled sport, until all are final
//   npm run record -- 20261017
//   npm run record -- --sports cfb,nhl     # only these sports (`all` = every supported sport)
//
// Writes recordings/<date>/ (each record names its sport):
//   scoreboard.ndjson.gz   every scoreboard poll per sport (12s +/- jitter while that sport has live games)
//   summaries.ndjson.gz    live play-by-play, one game every 8s round-robin (polite: ~0.2 req/s total)
//   finals.ndjson.gz       one full summary per game once it goes final (complete plays with wallclocks)
import path from 'node:path';
import { enabledSports, loadConfig, PROJECT_ROOT } from '../src/config';
import { EspnClient, espnDateKey } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import { appendRecord, trimSummary } from '../src/espn/recording';
import { RankCache, recordableScoreboard } from '../src/espn/rankings';
import type { GameSnapshot, SportId } from '../src/engine/types';
import { isSportId, SPORT_IDS, sportOf } from '../src/sports';

const cfg = loadConfig();
const client = new EspnClient(cfg.espn);
const ranks = new RankCache(client);
const args = process.argv.slice(2);
const sportsArg = args.includes('--sports') ? args[args.indexOf('--sports') + 1] : null;
const date = args.find((a) => /^\d{8}$/.test(a)) ?? espnDateKey();
const sports: SportId[] = !sportsArg ? enabledSports(cfg) : sportsArg === 'all' ? [...SPORT_IDS] : sportsArg.split(',').filter(isSportId);
if (!sports.length) {
  console.error(`No known sport in "${sportsArg}" (known: ${SPORT_IDS.join(', ')})`);
  process.exit(1);
}
const dir = path.join(PROJECT_ROOT, 'recordings', date);
const files = {
  scoreboard: path.join(dir, 'scoreboard.ndjson.gz'),
  summaries: path.join(dir, 'summaries.ndjson.gz'),
  finals: path.join(dir, 'finals.ndjson.gz'),
};

const SUMMARY_EVERY_MS = 8000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => (Math.random() * 2 - 1) * cfg.espn.jitterSeconds * 1000;
const hhmmss = () => new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });

const games = new Map<SportId, GameSnapshot[]>();
const all = () => [...games.values()].flat();
const isOver = (g: GameSnapshot) => g.phase === 'FINAL' || g.phase === 'POSTPONED' || g.phase === 'CANCELED';
const isLive = (g: GameSnapshot) => g.phase === 'LIVE' || g.phase === 'HALFTIME' || g.phase === 'DELAYED';
const finalsSaved = new Set<string>();
let rr = 0;
let bytes = 0;
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
  console.log(`\n${hhmmss()} stopping…`);
});

console.log(`Recording ESPN ${date} (${sports.map((s) => sportOf(s).short).join(', ')}) → ${dir}`);

async function pollScoreboard(sport: SportId): Promise<void> {
  try {
    const res = await client.scoreboard(date, sportOf(sport).espn);
    await ranks.attach(sport, date, res.body);
    bytes += appendRecord(files.scoreboard, { t: res.fetchedAt, kind: 'scoreboard', url: res.url, status: res.status, body: recordableScoreboard(sport, res.body), sport });
    games.set(sport, normalizeScoreboard(res.body, Date.parse(res.fetchedAt), sport));
  } catch (err) {
    appendRecord(files.scoreboard, { t: new Date().toISOString(), kind: 'error', error: String(err), sport });
    console.warn(`${hhmmss()} ${sport} scoreboard error: ${err}`);
  }
}

async function saveFinals(): Promise<void> {
  // Tennis has no summary to save (a match's final state is in the scoreboard).
  for (const g of all().filter((x) => isOver(x) && !finalsSaved.has(x.id) && !sportOf(x.sport).noSummary)) {
    if (stopping) return;
    try {
      const res = await client.summary(g.id, sportOf(g.sport).espn);
      bytes += appendRecord(files.finals, { t: res.fetchedAt, kind: 'final-summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body, g.sport), sport: g.sport });
      finalsSaved.add(g.id);
      console.log(`${hhmmss()} saved final play-by-play: ${sportOf(g.sport).short} ${g.shortName} (${g.detail})`);
    } catch (err) {
      console.warn(`${hhmmss()} final summary error ${g.shortName}: ${err}`);
    }
    await sleep(1500);
  }
}

async function summaryLoop(): Promise<void> {
  while (!stopping) {
    const live = all().filter((g) => isLive(g) && !sportOf(g.sport).noSummary);
    if (live.length) {
      const g = live[rr++ % live.length];
      try {
        const res = await client.summary(g.id, sportOf(g.sport).espn);
        bytes += appendRecord(files.summaries, { t: res.fetchedAt, kind: 'summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body, g.sport), sport: g.sport });
      } catch (err) {
        console.warn(`${hhmmss()} summary error ${g.shortName}: ${err}`);
      }
    }
    await sleep(SUMMARY_EVERY_MS);
  }
}

void summaryLoop();

while (!stopping) {
  for (const sport of sports) await pollScoreboard(sport);
  await saveFinals();
  const list = all();
  const live = list.filter(isLive);
  const pre = list.filter((g) => g.phase === 'PRE');
  const hot = live.flatMap((g) => {
    const h = sportOf(g.sport).excitement(g).hot;
    return h ? [`${g.shortName} (${h.label})`] : [];
  });
  const bySport = sports.map((s) => `${sportOf(s).short} ${(games.get(s) ?? []).filter(isLive).length}/${(games.get(s) ?? []).length}`).join(' ');
  console.log(`${hhmmss()} live/games: ${bySport} · ${finalsSaved.size} finals saved · ${(bytes / 1e6).toFixed(1)} MB` + (hot.length ? ` · ${hot.join(', ')}` : ''));
  if (list.length && !live.length && !pre.length && list.every((g) => finalsSaved.has(g.id) || !isOver(g) || sportOf(g.sport).noSummary)) {
    console.log(`${hhmmss()} all games final; done.`);
    break;
  }
  await sleep((live.length ? cfg.espn.scoreboardLiveSeconds : cfg.espn.scoreboardIdleSeconds) * 1000 + jitter());
}
stopping = true;
