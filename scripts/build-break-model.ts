// Build each sport's break forecast model from recorded play-by-play.
//   npm run build-break-model                         # every sport but college football, from every recordings/*/finals.ndjson.gz
//   npm run build-break-model -- --sport nhl          # one sport (--sport cfb rebuilds college football's shipped model)
//   npm run build-break-model -- recordings/20261017/finals.ndjson.gz ...
// For each play: category of the stoppage it starts (the sport's own rules), and the wallclock gap
// to the next play that resumes action. Writes config/break-models/<sport>.json.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config';
import { addGap, emptyModel, survival } from '../src/engine/forecast';
import type { SportId } from '../src/engine/types';
import { readRecords } from '../src/espn/recording';
import { isSportId, SPORTS, sportOf } from '../src/sports';

const args = process.argv.slice(2);
const only = args.includes('--sport') ? args[args.indexOf('--sport') + 1] : null;
if (only && !isSportId(only)) {
  console.error(`unknown sport "${only}"`);
  process.exit(1);
}
const fileArgs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sport');
const files = fileArgs.length
  ? fileArgs
  : readdirSync(path.join(PROJECT_ROOT, 'recordings'))
      .map((d) => path.join(PROJECT_ROOT, 'recordings', d, 'finals.ndjson.gz'))
      .filter((f) => existsSync(f));

/** Fewest timed plays for a game to count (drops games ESPN never filled in). */
const MIN_PLAYS: Partial<Record<string, number>> = { football: 50, basketball: 100, hockey: 80, baseball: 100, soccer: 10 };

const records = files.flatMap((f) => readRecords(f));
for (const mod of SPORTS) {
  if (only ? mod.id !== only : mod.id === 'cfb') continue; // CFB's model is frozen unless asked for by name
  if (mod.noSummary) {
    console.log(`${mod.short}: no play-by-play on ESPN; its model is rules-based (npm run build-tennis-model)`);
    continue;
  }
  const sport = mod.id as SportId;
  const model = emptyModel(5, mod.breaks.categories);
  const seen = new Set<string>();
  for (const rec of records) {
    if ((rec.sport ?? 'cfb') !== sport || !rec.eventId || seen.has(rec.eventId)) continue;
    const plays = mod.summaryPlays(rec.body).filter((p) => p.wallclock !== null);
    if (plays.length < (MIN_PLAYS[mod.family] ?? 50)) continue;
    seen.add(rec.eventId);
    model.games++;
    for (let i = 0; i < plays.length - 1; i++) {
      const cat = mod.breaks.categorize(plays[i], plays[i - 1]);
      if (!cat) continue;
      const j = plays.findIndex((x, k) => k > i && mod.breaks.resumes.has(x.kind));
      if (j < 0) continue;
      const next = plays[j];
      // A timeout (review, period end…) between this play and the restart is what the viewer's break
      // really follows: live, it replaces this play as the last one, so its gap counts there, not here.
      // (College football's shipped model was built without this rule and stays as it is.)
      if (sport !== 'cfb' && plays.slice(i + 1, j).some((x, k) => !mod.breaks.ignore?.(x) && mod.breaks.categorize(x, plays[i + k]) !== null)) continue;
      const gap = (next.wallclock! - plays[i].wallclock!) / 1000;
      if (gap < 0 || gap > 900) continue;
      addGap(model, cat, gap);
    }
  }
  if (!model.games) {
    console.log(`${mod.short}: no recorded games; model not written`);
    continue;
  }
  const out = path.join(PROJECT_ROOT, sportOf(sport).breaks.modelFile);
  writeFileSync(out, JSON.stringify(model));
  console.log(`\n${mod.short}: break model from ${model.games} games -> ${path.relative(PROJECT_ROOT, out)}`);
  console.log('  category               n     P(>=60s)  P(>=90s)  P(>=120s)');
  for (const c of mod.breaks.categories) {
    const n = model.categories[c]?.n ?? 0;
    const p = (t: number) => `${Math.round(survival(model, c, t) * 100)}%`.padStart(8);
    console.log(`  ${c.padEnd(20)} ${String(n).padStart(5)}  ${p(60)}  ${p(90)}  ${p(120)}`);
  }
}
