// Where does switch time go? Reads the switch timelines the app logs and prints per-stage numbers.
//   npm run switch-stats                       # today's decision log
//   npm run switch-stats -- --log logs/decisions-2026-10-17.jsonl [--since 21:00]
import { existsSync, readFileSync } from 'node:fs';
import { parseFlags } from '../src/cli';
import { PROJECT_ROOT } from '../src/config';
import { espnDateKey } from '../src/espn/client';
import { dailyLogFile, type LogEntry } from '../src/log';
import { etTime } from '../src/sim';
import { STAGES, summarize, type SwitchTiming } from '../src/windows/timing';

const { flags } = parseFlags(process.argv.slice(2));
const file = typeof flags.log === 'string' ? flags.log : dailyLogFile(PROJECT_ROOT);
if (!existsSync(file)) {
  console.error(`No log at ${file}`);
  process.exit(1);
}
const entries = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .flatMap((l) => {
    try {
      return [JSON.parse(l) as LogEntry];
    } catch {
      return [];
    }
  });
const day = espnDateKey(new Date(entries[0]?.at ?? Date.now()));
const since = typeof flags.since === 'string' ? etTime(day, flags.since) : 0;
const decisions = entries.filter((e): e is Extract<LogEntry, { type: 'decision' }> => e.type === 'decision' && e.switched);
const timings = entries
  .filter((e): e is Extract<LogEntry, { type: 'timing' }> => e.type === 'timing' && e.commandedAt >= since)
  .map((t: SwitchTiming) => {
    // The director decision that caused this tune: same screen, at most 3 s before the command.
    const d = decisions.filter((x) => x.screen === t.screen && x.at <= t.commandedAt + 50 && t.commandedAt - x.at < 3000).at(-1);
    return { ...t, decidedAt: d?.at ?? null };
  });

const outcomes = timings.reduce<Record<string, number>>((m, t) => ((m[t.outcome] = (m[t.outcome] ?? 0) + 1), m), {});
console.log(`Switch timings from ${file}`);
console.log(`  ${timings.length} channel changes: ${Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
const table = summarize(timings);
for (const [path, stages] of [...table].sort((a, b) => (a[0] === 'ALL' ? 1 : b[0] === 'ALL' ? -1 : a[0].localeCompare(b[0])))) {
  console.log(`${path === 'ALL' ? 'ALL PATHS' : `path: ${path}`}`);
  for (const [label] of STAGES) {
    const s = stages.get(label);
    console.log(`  ${label.padEnd(30)} ${s ? `mean ${s.mean.toFixed(1)}s  p50 ${s.p50.toFixed(1)}s  p90 ${s.p90.toFixed(1)}s  (n=${s.n})` : '-'}`);
  }
  console.log();
}
