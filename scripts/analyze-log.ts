// How well is the break detector doing? Compares your labels with what it decided, and suggests
// config changes.
//   npm run analyze-log                         # today's decisions + labels
//   npm run analyze-log -- --day 2026-10-17
//   npm run analyze-log -- --log logs/sim-20261017.jsonl   # switching stats for a simulation
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { analyze, type LabelEntry } from '../src/analyze';
import { parseFlags } from '../src/cli';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { clock, dailyLogFile, type LogEntry } from '../src/log';

const { flags } = parseFlags(process.argv.slice(2));
const day = typeof flags.day === 'string' ? flags.day : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const logFile = typeof flags.log === 'string' ? flags.log : dailyLogFile(PROJECT_ROOT, Date.parse(`${day}T12:00:00-04:00`));
const labelsFile = typeof flags.labels === 'string' ? flags.labels : path.join(PROJECT_ROOT, 'logs', 'labels.jsonl');

const readJsonl = <T>(f: string): T[] =>
  existsSync(f)
    ? readFileSync(f, 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as T];
          } catch {
            return [];
          }
        })
    : [];

const sameDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(at) === day;
const log = readJsonl<LogEntry>(logFile);
const labels = readJsonl<LabelEntry>(labelsFile).filter((l) => typeof flags.log === 'string' || sameDay(l.at));
const r = analyze(labels, log, loadConfig());

const p = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
console.log(`RedZone break-detector report for ${day}`);
console.log(`  decision log: ${existsSync(logFile) ? logFile : `${logFile} (not found)`}`);
console.log(`  labels:       ${r.labels.total} (${r.labels.breaks} "break", ${r.labels.live} "live") from ${labelsFile}\n`);
if (r.labels.total) {
  const c = r.confusion;
  console.log('Detector vs your labels');
  console.log(`  said BREAK? and it was a break   ${c.tp}`);
  console.log(`  said LIVE and it was live        ${c.tn}`);
  console.log(`  said BREAK? but it was live      ${c.fp}   (false breaks: switched away from action)`);
  console.log(`  said LIVE but it was a break     ${c.fn}   (missed breaks: stayed on a commercial)`);
  if (c.other) console.log(`  other states (halftime/final/unknown) ${c.other}`);
  console.log(`  precision ${p(r.precision)}   recall ${p(r.recall)}\n`);
  if (r.falseBreakSignals.length) console.log(`Signals active during false breaks: ${r.falseBreakSignals.map((s) => `${s.name} ${s.count} (${p(s.share)})`).join(', ')}`);
  if (r.missedBreakScores.length) console.log(`Scores during missed breaks: ${r.missedBreakScores.map((x) => x.toFixed(2)).join(', ')} (${r.missedWithNoSignal} with no signal at all)`);
  for (const e of r.examples.falseBreaks) console.log(`  false break  ${clock(e.at)} S${e.screen} ${e.game} ${e.detail ?? ''} | ${e.detector?.reasons.slice(0, 2).join(' | ')}`);
  for (const e of r.examples.missedBreaks) console.log(`  missed break ${clock(e.at)} S${e.screen} ${e.game} ${e.detail ?? ''} | score ${e.detector?.score.toFixed(2)}`);
  console.log();
}
const sw = r.switching;
console.log('Switching');
console.log(`  automatic switches ${sw.autoSwitches} over ${sw.screenHours.toFixed(1)} screen-hours${sw.perScreenHour !== null ? ` (${sw.perScreenHour.toFixed(1)} per screen-hour)` : ''}`);
console.log(`  break fill-ins ${sw.fills}, back home within ~30 s: ${sw.quickReturns}, breaks ended by the safety limit: ${sw.maxBreakExits}, duplicate picks: ${sw.duplicates}\n`);
console.log('Suggestions');
for (const s of r.suggestions) console.log(`  - ${s}`);
