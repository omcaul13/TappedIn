// Build the break forecast model from recorded play-by-play.
//   npm run build-break-model                       # every recordings/*/finals.ndjson.gz
//   npm run build-break-model -- recordings/20261017/finals.ndjson.gz ...
// For each play: category of the stoppage it starts, and the wallclock gap to the next live-ball play.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config';
import { addGap, categorize, CATEGORIES, DEFAULT_MODEL_PATH, emptyModel, survival } from '../src/engine/forecast';
import { normalizeSummaryPlays } from '../src/espn/normalize';
import { readRecords } from '../src/espn/recording';

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(path.join(PROJECT_ROOT, 'recordings'))
      .map((d) => path.join(PROJECT_ROOT, 'recordings', d, 'finals.ndjson.gz'))
      .filter((f) => existsSync(f));

const model = emptyModel(5);
const seen = new Set<string>();
const isResume = (k: string) => k === 'snap' || k === 'kickoff' || k === 'score';
for (const f of files) {
  for (const rec of readRecords(f)) {
    if (!rec.eventId || seen.has(rec.eventId)) continue;
    const plays = normalizeSummaryPlays(rec.body).filter((p) => p.wallclock !== null);
    if (plays.length < 50) continue;
    seen.add(rec.eventId);
    model.games++;
    for (let i = 0; i < plays.length - 1; i++) {
      const cat = categorize(plays[i], plays[i - 1]);
      if (!cat) continue;
      const next = plays.find((x, k) => k > i && isResume(x.kind));
      if (!next) continue;
      const gap = (next.wallclock! - plays[i].wallclock!) / 1000;
      if (gap < 0 || gap > 900) continue;
      addGap(model, cat, gap);
    }
  }
}
writeFileSync(DEFAULT_MODEL_PATH, JSON.stringify(model));
console.log(`break model from ${model.games} games (${files.length} file(s)) -> ${DEFAULT_MODEL_PATH}`);
console.log('  category               n     P(>=60s)  P(>=90s)  P(>=120s)');
for (const c of CATEGORIES) {
  const n = model.categories[c].n;
  const p = (t: number) => `${Math.round(survival(model, c, t) * 100)}%`.padStart(8);
  console.log(`  ${c.padEnd(20)} ${String(n).padStart(5)}  ${p(60)}  ${p(90)}  ${p(120)}`);
}
