// Replay a game day through the real director and print every decision.
//   npm run sim -- --day 20261017                         # recorded day, homes picked automatically
//   npm run sim -- --day 20261017 --from 19:30 --to 22:00 --homes 401856700,401856701,401856702,401856703
//   npm run sim -- --day 20261010 --synth                 # rebuilt from final play-by-play (npm run fetch-day first)
//   npm run sim -- --day 20261017 --compare               # before (classic) vs forecast Low/Medium/High, same homes
//   npm run sim -- --day 20261018 --synth --by-sport          # per home sport: switches, time away, false switches, tiers
//   flags: --model classic|forecast  --sensitivity low|medium|high  --screen-sports nhl,nfl,cfb,nba  --games  --quiet  --log <file.jsonl>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../src/cli';
import { loadConfig, PROJECT_ROOT, type Config } from '../src/config';
import { espnDateKey } from '../src/espn/client';
import { recordingDir } from '../src/espn/source';
import { clock, formatEntry, type LogEntry } from '../src/log';
import { etTime, runSim, type SimOptions } from '../src/sim';
import { computeMetrics, loadFinalPlays, type SimMetrics } from '../src/simMetrics';
import { isSportId, sportOf } from '../src/sports';

const { flags } = parseFlags(process.argv.slice(2));
const date = typeof flags.day === 'string' ? flags.day : espnDateKey();
const base = loadConfig();
const quiet = flags.quiet === true || flags.compare === true;
const allGames = flags.games === true;

const variant = (model: 'classic' | 'forecast', sensitivity?: 'low' | 'medium' | 'high'): Config => {
  const c = structuredClone(base);
  c.switching.breakModel = model;
  if (sensitivity) c.switching.sensitivity = sensitivity;
  return c;
};
if (flags['no-regional']) base.sports.nflRegionalCheck = false;
if (flags['full-lineup']) base.simulation.fullLineup = true;
const cfg = variant(
  flags.model === 'classic' ? 'classic' : flags.model === 'forecast' ? 'forecast' : base.switching.breakModel,
  flags.sensitivity === 'low' || flags.sensitivity === 'medium' || flags.sensitivity === 'high' ? flags.sensitivity : undefined,
);

const simOpts: SimOptions = {
  root: PROJECT_ROOT,
  date,
  synth: flags.synth === true,
  fromMs: typeof flags.from === 'string' ? etTime(date, flags.from) : undefined,
  toMs: typeof flags.to === 'string' ? etTime(date, flags.to) + (flags.to < '06:00' ? 86_400_000 : 0) : undefined,
  homes: typeof flags.homes === 'string' ? flags.homes.split(',') : undefined,
  screenSports: typeof flags['screen-sports'] === 'string' ? flags['screen-sports'].split(',').map((x) => (isSportId(x) ? x : null)) : undefined,
  captureTimeline: true,
  onEntry: (e: LogEntry) => {
    if (quiet) return;
    if (e.type === 'assess' && !e.relevant && !allGames) return;
    if (e.type === 'decision' && e.rule === 'HOLD_DWELL') return console.log(`\x1b[2m${formatEntry(e)}\x1b[0m`);
    console.log(formatEntry(e));
  },
};

if (flags.compare) {
  const finals = loadFinalPlays(recordingDir(PROJECT_ROOT, date));
  const variants: [string, Config][] = [
    ['before: classic', variant('classic')],
    ['forecast Low', variant('forecast', 'low')],
    ['forecast Medium', variant('forecast', 'medium')],
    ['forecast High', variant('forecast', 'high')],
  ];
  const rows: SimMetrics[] = [];
  let homes = simOpts.homes;
  for (const [label, c] of variants) {
    const t0 = Date.now();
    const res = await runSim(c, { ...simOpts, homes });
    homes ??= res.homes.map((h) => h.gameId);
    rows.push(computeMetrics(label, res, finals, c));
    if (res.violations.length) console.log(`  ${label}: ${res.violations.length} INVARIANT VIOLATIONS, e.g. ${res.violations[0]}`);
    if (rows.length === 1) console.log(`compare ${date}${flags.synth ? ' (synthesized)' : ''}: ${res.startedAt ? clock(res.startedAt) : '?'} -> ${res.endedAt ? clock(res.endedAt) : '?'} ET, homes ${res.homes.map((h) => h.game).join(', ')}`);
    process.stdout.write(`  ran ${label} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  const n = (x: number | null, d = 0) => (x === null ? 'n/a' : x.toFixed(d));
  console.log('\n' + ['variant'.padEnd(17), 'switches', '/scr-hr', 'fills', 'short<45s', 'avg away', 'long breaks caught', 'commercial skipped', 'action missed'].join('  '));
  for (const r of rows) {
    console.log(
      [
        r.label.padEnd(17),
        String(r.autoSwitches).padStart(8),
        r.switchesPerScreenHour.toFixed(1).padStart(7),
        String(r.fills).padStart(5),
        `${n(r.shortFills)}${r.shortFills !== null && r.fills ? ` (${Math.round((100 * r.shortFills) / r.fills)}%)` : ''}`.padStart(9),
        `${Math.round(r.avgAwaySec)}s`.padStart(8),
        `${n(r.longBreaksCaught)} of ${n(r.longBreaks)}`.padStart(18),
        `${n(r.skippedBreakMin)} min`.padStart(18),
        `${n(r.missedActionMin)} min`.padStart(13),
      ].join('  '),
    );
  }
  writeFileSync(path.join(PROJECT_ROOT, 'logs', `compare-${date}${flags.synth ? '-synth' : ''}.json`), JSON.stringify(rows, null, 2));
  process.exit(0);
}

const logFile = typeof flags.log === 'string' ? flags.log : path.join(PROJECT_ROOT, 'logs', `sim-${date}${flags.synth ? '-synth' : ''}.jsonl`);
const t0 = Date.now();
const res = await runSim(cfg, simOpts);
mkdirSync(path.dirname(logFile), { recursive: true });
writeFileSync(logFile, res.entries.map((e) => JSON.stringify(e)).join('\n') + '\n');

console.log(`\n=== sim ${date}${flags.synth ? ' (synthesized)' : ''} [${cfg.switching.breakModel}${cfg.switching.breakModel === 'forecast' ? ` ${cfg.switching.sensitivity}` : ''}]: ${res.startedAt ? clock(res.startedAt) : '?'} → ${res.endedAt ? clock(res.endedAt) : '?'} ET, ${res.ticks} ticks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const h of res.homes) {
  const share = res.timeShare[h.screen] ?? {};
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  const pct = Object.entries(share)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`)
    .join(', ');
  console.log(`S${h.screen} home ${h.game.padEnd(12)} ${pct}`);
}
console.log('decisions:', Object.entries(res.ruleCounts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
console.log(res.violations.length ? `INVARIANT VIOLATIONS (${res.violations.length}):\n  ${res.violations.slice(0, 20).join('\n  ')}` : 'invariants: all held');

if (flags['by-sport']) {
  // Per home sport: how often its screens switched, how long they stayed away, and how many switches
  // look false (the home game resumed within 45 s of the viewer leaving it).
  const finals = loadFinalPlays(recordingDir(PROJECT_ROOT, date));
  const sports = [...new Set(res.homes.map((h) => h.sport))];
  const rows = [computeMetrics('all', res, finals, cfg), ...sports.map((s) => computeMetrics(sportOf(s).short, res, finals, cfg, 90, 45, s))];
  const n = (x: number | null) => (x === null ? 'n/a' : String(x));
  console.log('\n' + ['sport'.padEnd(6), 'scr-hrs', 'switches', '/scr-hr', 'fills', 'same/screen/other', 'avg away', 'false (<45s)', 'long breaks caught'].join('  '));
  for (const r of rows) {
    const pct = r.shortFills !== null && r.fills ? ` (${Math.round((100 * r.shortFills) / r.fills)}%)` : '';
    console.log(
      [
        r.label.padEnd(6),
        r.screenHours.toFixed(1).padStart(7),
        String(r.autoSwitches).padStart(8),
        r.switchesPerScreenHour.toFixed(1).padStart(7),
        String(r.fills).padStart(5),
        `${r.fillsByTier[1]}/${r.fillsByTier[2]}/${r.fillsByTier[3]}`.padStart(17),
        `${Math.round(r.avgAwaySec)}s`.padStart(8),
        `${n(r.shortFills)}${pct}`.padStart(12),
        `${n(r.longBreaksCaught)} of ${n(r.longBreaks)}`.padStart(18),
      ].join('  '),
    );
  }
  writeFileSync(path.join(PROJECT_ROOT, 'logs', `by-sport-${date}${flags.synth ? '-synth' : ''}.json`), JSON.stringify(rows, null, 2));
}
console.log(`log: ${logFile}`);
