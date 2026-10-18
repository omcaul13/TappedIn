// Download a past game day's final play-by-play so it can be simulated with --synth.
//   npm run fetch-day -- 20261010                    # college football (as before)
//   npm run fetch-day -- 20260221 --sports mcbb,wcbb # other sports (`all` = every supported sport)
// Polite: one request every 1.5 s. Saves recordings/<date>/finals.ndjson.gz (skips games already saved).
import { existsSync } from 'node:fs';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { EspnClient } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import { appendRecord, readRecords, recordingFiles, trimSummary } from '../src/espn/recording';
import { recordingDir } from '../src/espn/source';
import type { SportId } from '../src/engine/types';
import { isSportId, SPORT_IDS, sportOf } from '../src/sports';

const args = process.argv.slice(2);
const date = args.find((a) => /^\d{8}$/.test(a));
const sportsArg = args.includes('--sports') ? args[args.indexOf('--sports') + 1] : 'cfb';
const sports: SportId[] = sportsArg === 'all' ? [...SPORT_IDS] : sportsArg.split(',').filter(isSportId);
if (!date || !sports.length) {
  console.error(`Usage: npm run fetch-day -- YYYYMMDD [--sports ${SPORT_IDS.join(',')}|all]`);
  process.exit(1);
}
const cfg = loadConfig();
const client = new EspnClient(cfg.espn);
const files = recordingFiles(recordingDir(PROJECT_ROOT, date));
const have = new Set(existsSync(files.finals) ? readRecords(files.finals).map((r) => `${r.sport ?? 'cfb'}:${r.eventId}`) : []);

for (const sport of sports) {
  const league = sportOf(sport).espn;
  const sb = await client.scoreboard(date, league);
  const games = normalizeScoreboard(sb.body, Date.now(), sport).filter((g) => g.phase === 'FINAL');
  console.log(`${date} ${sportOf(sport).short}: ${games.length} final games`);
  for (const g of games) {
    if (have.has(`${sport}:${g.id}`)) continue;
    try {
      const res = await client.summary(g.id, league);
      appendRecord(files.finals, { t: res.fetchedAt, kind: 'final-summary', eventId: g.id, url: res.url, status: res.status, body: trimSummary(res.body, sport), sport });
      console.log(`  saved ${g.shortName} (${g.away.score}-${g.home.score})`);
    } catch (err) {
      console.warn(`  ${g.shortName}: ${err}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
console.log(`done → ${files.finals}`);
