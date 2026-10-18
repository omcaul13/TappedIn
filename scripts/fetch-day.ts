// Download a past game day's final play-by-play so it can be simulated with --synth.
//   npm run fetch-day -- 20261010
// Polite: one request every 1.5 s. Saves recordings/<date>/finals.ndjson.gz (skips games already saved).
import { existsSync } from 'node:fs';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { EspnClient } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import { appendRecord, readRecords, recordingFiles, trimSummary } from '../src/espn/recording';
import { recordingDir } from '../src/espn/source';

const date = process.argv[2];
if (!/^\d{8}$/.test(date ?? '')) {
  console.error('Usage: npm run fetch-day -- YYYYMMDD');
  process.exit(1);
}
const cfg = loadConfig();
const client = new EspnClient(cfg.espn);
const files = recordingFiles(recordingDir(PROJECT_ROOT, date));
const have = new Set(existsSync(files.finals) ? readRecords(files.finals).map((r) => r.eventId) : []);

const sb = await client.scoreboard(date);
const games = normalizeScoreboard(sb.body, Date.now()).filter((g) => g.phase === 'FINAL');
console.log(`${date}: ${games.length} final games, ${have.size} already saved`);
for (const g of games) {
  if (have.has(g.id)) continue;
  try {
    const res = await client.summary(g.id);
    appendRecord(files.finals, { t: res.fetchedAt, kind: 'final-summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body) });
    console.log(`  saved ${g.shortName} (${g.away.score}-${g.home.score})`);
  } catch (err) {
    console.warn(`  ${g.shortName}: ${err}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`done → ${files.finals}`);
