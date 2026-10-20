// Tennis break models from the rulebook (ESPN has no tennis play-by-play to measure gaps from).
//   npm run build-tennis-model
// ATP and WTA rules: 90 s seated at a changeover (after the 3rd, 5th… game of a set; none after the
// 1st, none at a tiebreak's change of ends) and 120 s at a set break. The gap from a game's last point
// to the next serve runs a little longer than the rest (walking, towels, the serve clock), so each
// category is spread over the 5 s bins after its rule time. Writes config/break-models/{atp,wta}.json.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config';
import { addGap, emptyModel, survival } from '../src/engine/forecast';
import { sportOf } from '../src/sports';
import { TENNIS_CATEGORIES } from '../src/sports/tennis';

/** Relative weight of each 5 s bin from the rule time on: most restarts 5–20 s after it. */
const SPREAD = [1, 3, 5, 5, 3, 2, 1];
const RULE_SECONDS: Record<(typeof TENNIS_CATEGORIES)[number], number> = { changeover: 85, setBreak: 120 };

for (const sport of ['atp', 'wta'] as const) {
  const model = emptyModel(5, TENNIS_CATEGORIES);
  for (const c of TENNIS_CATEGORIES) SPREAD.forEach((w, i) => { for (let k = 0; k < w; k++) addGap(model, c, RULE_SECONDS[c] + i * 5 + 2.5); });
  model.games = 0; // rules-based: no recorded games behind it
  const out = path.join(PROJECT_ROOT, sportOf(sport).breaks.modelFile);
  writeFileSync(out, JSON.stringify(model));
  console.log(`${sport}: rules-based break model -> ${path.relative(PROJECT_ROOT, out)}`);
  for (const c of TENNIS_CATEGORIES) console.log(`  ${c.padEnd(12)} P(>=60s) ${Math.round(survival(model, c, 60) * 100)}%  P(>=90s) ${Math.round(survival(model, c, 90) * 100)}%  P(>=120s) ${Math.round(survival(model, c, 120) * 100)}%`);
}
