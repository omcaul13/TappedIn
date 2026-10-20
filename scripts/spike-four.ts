// Phase 0 spike: four tiled windows playing at once.
//   npm run spike:four -- ESPN ESPN2 ABC FOX              # 4 channels (defaults to the first 4 configured)
//   npm run spike:four -- ESPN ESPN2 ABC FOX --app --seconds 180 --stagger 10
//
// Starts the windows one at a time (stagger) so a concurrency limit shows up on a specific window,
// then watches all four for --seconds, logging every state change and any error text on screen.
// Only screen 1 keeps its sound.
import type { Page } from 'playwright-core';
import { loadConfig } from '../src/config';
import { connect, debugEndpoint, gridBounds, openWindow, setWindowBounds, workArea } from '../src/windows/chrome';
import { HealthTracker, probePage, setMuted, type Health } from '../src/windows/health';
import { configuredChannels, cpuLoadPercent, gpuVideoDecode, parkOtherPlayers, parseFlags, resolveChannelArg, screenshot, sleep, ts, tune, writeReport } from './spike-lib';

const cfg = loadConfig();
const { positional, flags } = parseFlags(process.argv.slice(2));
const app = flags.app === true;
const seconds = Number(flags.seconds ?? 180);
const stagger = Number(flags.stagger ?? 10);
const channels = (positional.length ? positional.map((a) => resolveChannelArg(cfg, a)) : configuredChannels(cfg)).slice(0, 4);
if (channels.length < 4) {
  console.error(`Need 4 channels (got ${channels.length}). Pass names/URLs or fill in config channels.`);
  process.exit(1);
}
if (!(await debugEndpoint(cfg))) {
  console.error('TappedIn Chrome is not running. Run `npm run login` first and sign in.');
  process.exit(1);
}

const { browser, context } = await connect(cfg);
const parked = await parkOtherPlayers(context);
if (parked) console.log(`${ts()} stopped ${parked} player tab(s) that were already open`);
const pages: Page[] = [];
for (let i = 0; i < 4; i++) pages.push(await openWindow(cfg, browser, context, `RZ-SPIKE-${i + 1}`, app));
const area = await workArea(pages[0]);
const tiles = gridBounds(area);
for (const [i, p] of pages.entries()) await setWindowBounds(p, tiles[i]);
console.log(`${ts()} 4 windows tiled (${app ? 'app mode' : 'normal'}) at ${tiles[0].width}x${tiles[0].height} each`);

interface ScreenRun {
  screen: number;
  channel: string;
  startedAt: number | null;
  timeToPlayingSec: number | null;
  states: Record<string, number>;
  transitions: { atSec: number; state: string; detail: string }[];
  lastHealth: Health | null;
  muted: boolean;
}
const trackers = pages.map(() => new HealthTracker());
const runs: ScreenRun[] = channels.map((c, i) => ({ screen: i + 1, channel: c.name, startedAt: null, timeToPlayingSec: null, states: {}, transitions: [], lastHealth: null, muted: false }));

const t0 = Date.now();
const cpu: { atSec: number; load: number | null }[] = [];
let lastCpu = 0;

// Kick off navigations on a stagger without blocking the monitor loop.
channels.forEach((ch, i) => {
  setTimeout(() => {
    runs[i].startedAt = Date.now();
    trackers[i].reset();
    console.log(`${ts()} [S${i + 1}] tuning ${ch.name}`);
    tune(pages[i], ch)
      .then((r) => {
        trackers[i].reset();
        console.log(`${ts()} [S${i + 1}] guide click → ${r.url} (${r.guideMs ?? '-'} ms)`);
      })
      .catch((err) => console.warn(`${ts()} [S${i + 1}] tune error: ${String(err).split('\n')[0]}`));
  }, i * stagger * 1000);
});

const endAt = t0 + (3 * stagger + seconds) * 1000;
while (Date.now() < endAt) {
  await Promise.all(
    pages.map(async (page, i) => {
      const run = runs[i];
      if (!run.startedAt) return;
      const h = trackers[i].update(await probePage(page));
      run.lastHealth = h;
      run.states[h.state] = (run.states[h.state] ?? 0) + 1;
      const atSec = +((Date.now() - run.startedAt) / 1000).toFixed(1);
      if (run.transitions.at(-1)?.state !== h.state) {
        run.transitions.push({ atSec, state: h.state, detail: h.detail });
        console.log(`${ts()} [S${i + 1}] ${run.channel}: ${h.state} @ ${atSec}s  ${h.detail}`);
      }
      if (h.state === 'PLAYING' && run.timeToPlayingSec === null) {
        run.timeToPlayingSec = atSec;
        if (i > 0 && !run.muted) {
          await setMuted(page, true);
          run.muted = true;
        }
      }
    }),
  );
  if (Date.now() - lastCpu > 30000) {
    lastCpu = Date.now();
    void cpuLoadPercent().then((load) => cpu.push({ atSec: Math.round((Date.now() - t0) / 1000), load }));
  }
  await sleep(2000);
}

const shots = [];
for (const [i, p] of pages.entries()) shots.push(await screenshot(p, `spike-four-S${i + 1}-${Date.now()}.jpg`));
const gpu = await gpuVideoDecode(browser);

const summary = runs.map((r) => {
  const total = Object.values(r.states).reduce((a, b) => a + b, 0) || 1;
  return {
    screen: r.screen,
    channel: r.channel,
    timeToPlayingSec: r.timeToPlayingSec,
    playingPct: Math.round(((r.states.PLAYING ?? 0) / total) * 100),
    finalState: r.lastHealth?.state,
    finalDetail: r.lastHealth?.detail,
    states: r.states,
    transitions: r.transitions,
  };
});
const file = writeReport(`spike-four-${Date.now()}.json`, { at: new Date().toISOString(), windowMode: app ? 'app' : 'normal', tile: tiles[0], staggerSec: stagger, watchSec: seconds, summary, cpu, gpu, screenshots: shots });

console.log('\n=== spike:four summary ===');
for (const s of summary) console.log(`S${s.screen} ${s.channel.padEnd(14)} ttp ${String(s.timeToPlayingSec ?? '—').padStart(5)}s  playing ${String(s.playingPct).padStart(3)}%  final ${s.finalState}  ${s.finalState === 'PLAYING' ? '' : s.finalDetail ?? ''}`);
console.log(`CPU load samples: ${cpu.map((c) => `${c.load}%`).join(', ')}`);
console.log(`GPU: ${JSON.stringify(gpu)}`);
console.log(`Report: ${file}`);
process.exit(0);
