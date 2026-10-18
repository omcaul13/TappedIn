// Drives the Electron spike (electron/spike.cjs): tunes each view with the same Tuner/health code the
// Chrome app uses, then watches them all for a while and reports what played.
//   npx tsx scripts/spike-electron.ts ESPN ESPN2 ABC FOX [--watch 60] [--stagger 4]
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { parseFlags } from '../src/cli';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { HealthTracker, probePage, WIDEVINE_JS } from '../src/windows/health';
import { Tuner } from '../src/windows/tune';
import { resolveChannelArg, sleep, ts, writeReport } from './spike-lib';

const { positional, flags } = parseFlags(process.argv.slice(2));
const cfg = loadConfig();
const port = Number(flags.port ?? 9335);
const watchSec = Number(flags.watch ?? 60);
const stagger = Number(flags.stagger ?? 4);
const channels = (positional.length ? positional : ['ESPN']).map((a) => resolveChannelArg(cfg, a));

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const pages: Page[] = [];
// Views are found by their marker title; once tuned they're on Xfinity, so remember them by window
// order instead: --retune re-uses the Xfinity pages in the order the spike created them.
for (let i = 0; i < 40 && pages.length < channels.length; i++) {
  pages.length = 0;
  for (const c of browser.contexts()) for (const p of c.pages()) if (/^RZ-SPIKE-\d$/.test(await p.title().catch(() => '')) || (flags.retune && /xfinity\.com\/stream\/live/.test(p.url()))) pages.push(p);
  if (pages.length < channels.length) await sleep(500);
}
const titled = await Promise.all(pages.map(async (p, i) => ({ p, n: /^RZ-SPIKE-\d$/.test(await p.title()) ? Number((await p.title()).slice(-1)) : i + 1 })));
titled.sort((a, b) => a.n - b.n);
console.log(`${ts()} attached to ${titled.length} view(s): ${titled.map((t) => `RZ-SPIKE-${t.n}`).join(', ')}`);
if (titled.length < channels.length) console.warn(`only ${titled.length} views for ${channels.length} channels`);

const tuner = new Tuner(path.join(PROJECT_ROOT, '.state', 'xfinity-urls.json'), { fastPath: true });
const results: Record<string, unknown>[] = [];
const trackers: HealthTracker[] = [];

async function tuneOne(page: Page, idx: number) {
  const ch = channels[idx];
  const tracker = new HealthTracker({ startupSeconds: 25, stallSeconds: 12 });
  trackers[idx] = tracker;
  const t0 = Date.now();
  const r: Record<string, unknown> = { view: idx + 1, channel: ch.name };
  try {
    const out = await tuner.tune(page, ch.number!);
    r.path = out.path;
    r.pageSec = +((Date.now() - t0) / 1000).toFixed(1);
    r.url = page.url();
  } catch (err) {
    r.tuneError = String(err).split('\n')[0];
  }
  tracker.reset();
  for (let i = 0; i < 100; i++) {
    const h = tracker.update(await probePage(page).catch(() => []));
    if (h.state === 'PLAYING') {
      r.playingSec = +((Date.now() - t0) / 1000).toFixed(1);
      break;
    }
    if (['STREAM_LIMIT', 'LOGIN_REQUIRED', 'CHANNEL_UNAVAILABLE', 'DRM_ERROR', 'MEDIA_ERROR', 'UNKNOWN_ERROR', 'STALLED'].includes(h.state)) {
      r.problem = `${h.state}: ${h.detail}`;
      break;
    }
    await sleep(300);
  }
  const frames = await probePage(page).catch(() => []);
  const top = frames.find((f) => f.isTop);
  r.webdriver = top?.webdriver;
  r.widevine = await page.evaluate(WIDEVINE_JS).catch((e) => ({ ok: false, error: String(e) }));
  r.mediaKeys = frames.flatMap((f) => f.videos).some((v) => v.hasMediaKeys);
  r.errorText = frames.flatMap((f) => f.errorLines).slice(0, 4);
  r.userAgent = await page.evaluate('navigator.userAgent').catch(() => null);
  console.log(`${ts()} view ${idx + 1} ${ch.name}: ${r.playingSec ? `PLAYING after ${r.playingSec}s` : `NOT playing (${r.problem ?? r.tuneError ?? 'timeout'})`} via ${r.path ?? '-'}${(r.errorText as string[]).length ? ` | page says: ${(r.errorText as string[]).join(' / ')}` : ''}`);
  results[idx] = r;
}

const n = Math.min(titled.length, channels.length);
await Promise.all(titled.slice(0, channels.length).map(async ({ p }, i) => {
  await sleep((flags.reverse ? n - 1 - i : i) * stagger * 1000); // --reverse: tune the last view first
  await tuneOne(p, i);
}));

console.log(`${ts()} watching all views for ${watchSec}s…`);
const playing = titled.map(() => 0);
let samples = 0;
const end = Date.now() + watchSec * 1000;
while (Date.now() < end) {
  samples++;
  await Promise.all(titled.slice(0, channels.length).map(async ({ p }, i) => {
    const h = trackers[i].update(await probePage(p).catch(() => []));
    if (h.state === 'PLAYING') playing[i]++;
  }));
  await sleep(2000);
}
titled.slice(0, channels.length).forEach((_, i) => ((results[i] as Record<string, unknown>).playingPct = Math.round((playing[i] / Math.max(1, samples)) * 100)));
const file = writeReport(`spike-electron-${Date.now()}.json`, { at: new Date().toISOString(), results });
console.log('\n=== Electron spike summary ===');
for (const r of results) console.log(`view ${r.view} ${String(r.channel).padEnd(12)} ${r.playingSec ? `playing in ${r.playingSec}s` : 'NOT PLAYING'}  kept playing ${r.playingPct}% of ${watchSec}s  widevine ${JSON.stringify(r.widevine)}  ${r.problem ?? ''}`);
console.log(`user agent: ${results[0]?.userAgent}`);
console.log(`report: ${file}`);
process.exit(0);
