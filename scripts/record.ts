// Record a game day's ESPN data for replay/simulation and heuristic tuning.
//   npm run record                 # today's slate (ET), runs until every game is final
//   npm run record -- 20261017
//
// Writes recordings/<date>/:
//   scoreboard.ndjson.gz   every scoreboard poll (12s +/- jitter while games are live)
//   summaries.ndjson.gz    live play-by-play, one game every 8s round-robin (polite: ~0.2 req/s total)
//   finals.ndjson.gz       one full summary per game once it goes final (complete plays with wallclocks)
import path from 'node:path';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { EspnClient, espnDateKey } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import { appendRecord, trimSummary } from '../src/espn/recording';
import type { GameSnapshot } from '../src/engine/types';

const cfg = loadConfig();
const client = new EspnClient(cfg.espn);
const date = process.argv[2] ?? espnDateKey();
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

let games: GameSnapshot[] = [];
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

console.log(`Recording ESPN ${date} → ${dir}`);

async function pollScoreboard(): Promise<void> {
  try {
    const res = await client.scoreboard(date);
    bytes += appendRecord(files.scoreboard, { t: res.fetchedAt, kind: 'scoreboard', url: res.url, status: res.status, body: res.body });
    games = normalizeScoreboard(res.body, Date.parse(res.fetchedAt));
  } catch (err) {
    appendRecord(files.scoreboard, { t: new Date().toISOString(), kind: 'error', error: String(err) });
    console.warn(`${hhmmss()} scoreboard error: ${err}`);
  }
}

async function saveFinals(): Promise<void> {
  for (const g of games.filter((x) => isOver(x) && !finalsSaved.has(x.id))) {
    if (stopping) return;
    try {
      const res = await client.summary(g.id);
      bytes += appendRecord(files.finals, { t: res.fetchedAt, kind: 'final-summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body) });
      finalsSaved.add(g.id);
      console.log(`${hhmmss()} saved final play-by-play: ${g.shortName} (${g.detail})`);
    } catch (err) {
      console.warn(`${hhmmss()} final summary error ${g.shortName}: ${err}`);
    }
    await sleep(1500);
  }
}

async function summaryLoop(): Promise<void> {
  while (!stopping) {
    const live = games.filter(isLive);
    if (live.length) {
      const g = live[rr++ % live.length];
      try {
        const res = await client.summary(g.id);
        bytes += appendRecord(files.summaries, { t: res.fetchedAt, kind: 'summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body) });
      } catch (err) {
        console.warn(`${hhmmss()} summary error ${g.shortName}: ${err}`);
      }
    }
    await sleep(SUMMARY_EVERY_MS);
  }
}

void summaryLoop();

while (!stopping) {
  await pollScoreboard();
  await saveFinals();
  const live = games.filter(isLive);
  const pre = games.filter((g) => g.phase === 'PRE');
  const rz = live.filter((g) => g.situation?.isRedZone).map((g) => g.shortName);
  console.log(
    `${hhmmss()} ${games.length} games · ${live.length} live · ${pre.length} upcoming · ${finalsSaved.size} finals saved · ${(bytes / 1e6).toFixed(1)} MB` +
      (rz.length ? ` · red zone: ${rz.join(', ')}` : ''),
  );
  if (games.length && !live.length && !pre.length && games.every((g) => finalsSaved.has(g.id))) {
    console.log(`${hhmmss()} all games final; done.`);
    break;
  }
  await sleep((live.length ? cfg.espn.scoreboardLiveSeconds : cfg.espn.scoreboardIdleSeconds) * 1000 + jitter());
}
stopping = true;
