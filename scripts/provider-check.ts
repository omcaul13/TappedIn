// Try one TV service's adapter on its own, without the engine or ESPN:
//   npm run provider-check -- [<provider id>] [--scan [--save]] [--tune ESPN,FS1,...] [--views N] [--watch S]
// It opens the RedZone window (signing the service in the usual way), then:
//   --scan   reads the service's guide and shows which college-football networks it found
//            (--save writes them to .state/lineups/<id>.json, which the app then uses)
//   --tune   tunes the channels one by one, spread over the first N views (default 1), and reports
//            the path, time, whether it landed on the right channel and the stream health after --watch
//            seconds (default 12)
// Standby views are off here. Close the window or press Ctrl+C to stop early.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { parseFlags } from '../src/cli';
import { loadConfig, loadOverrides, withOverrides } from '../src/config';
import { channelRef, effectiveChannels, lineupFile } from '../src/providers/lineup';
import { matchLineup } from '../src/providers/networks';
import { adapterFor, loadProviderConfig, STATE_DIR } from '../src/providers/registry';
import { attachShell, startShell } from '../src/shell';
import { errorRules, probePage } from '../src/windows/health';
import { ScreenWindow } from '../src/windows/screen';
import { cacheFileFor, Tuner } from '../src/windows/tuner';

const { positional, flags } = parseFlags(process.argv.slice(2));
const base = withOverrides(loadConfig(), loadOverrides());
const id = positional[0] ?? base.provider;
const cfg = { ...base, provider: id, electron: { ...base.electron, standbyViews: 0 } };
const provider = loadProviderConfig(id, { onWarning: (m) => console.warn(`warning: ${m}`) });
const adapter = adapterFor(provider);
const views = Math.max(1, Math.min(4, Number(flags.views ?? 1)));
const watchSeconds = Math.max(3, Number(flags.watch ?? 12));
const t = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const log = (s: string) => console.log(`${t()} ${s}`);

log(`${provider.name} (${provider.id}, ${provider.status})${provider.documentedMaxStreams ? `, documented limit ${provider.documentedMaxStreams} stream(s)` : ''}`);
let signin = 'unknown';
const shell = await startShell(
  cfg,
  'about:blank',
  {
    signin: (s) => {
      signin = s.state;
      log(`sign-in: ${s.state}${s.detail ? ` (${s.detail})` : ''}`);
    },
    exit: (code) => {
      log(`window closed${code ? ` (exit ${code})` : ''}`);
      process.exit(0);
    },
    log: (s) => log(s),
  },
  provider,
);
await shell.ready;
if (signin !== 'ok') log(`sign-in ended as "${signin}"; continuing anyway`);
const { screens } = await attachShell(cfg, 4, provider);
const tuner = new Tuner(adapter, cacheFileFor(id, STATE_DIR), { fastPath: true });

if (flags.scan) {
  const page = screens[0].page;
  log('scanning the guide…');
  const found = await adapter.discoverLineup(page, tuner.tools);
  log(`${found.length} guide rows`);
  const lineup = matchLineup(found);
  for (const [key, e] of Object.entries(lineup)) console.log(`  ${key.padEnd(20)} ${e.number === null ? '—' : String(e.number).padEnd(6)} ${e.callSign ?? ''} ${e.ref ?? ''}`);
  if (flags.save) {
    const file = lineupFile(id, STATE_DIR);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(lineup, null, 2));
    log(`saved ${file}`);
  }
}

if (typeof flags.tune === 'string') {
  const channels = effectiveChannels(cfg, id, STATE_DIR);
  const names = flags.tune.split(',').map((s) => s.trim()).filter(Boolean);
  const results: string[] = [];
  const tuneOne = async (name: string, i: number, sw: ScreenWindow) => {
    const key = Object.keys(channels).find((k) => k.toLowerCase() === name.toLowerCase() || channels[k].aliases.some((a) => a.toLowerCase() === name.toLowerCase()));
    const number = key ? channels[key].number : null;
    const view = screens[i % views];
    if (number === null) return void results.push(`${name.padEnd(8)} ${view.name}: not in this lineup`);
    try {
      const out = await sw.tuneChannel(channelRef(channels, number)!);
      const landed = adapter.onChannel(view.page.url(), sw.ref!);
      let h = await sw.checkHealth();
      for (let s = 0; s < watchSeconds && h?.state !== 'PLAYING'; s++) {
        await new Promise((r) => setTimeout(r, 1000));
        h = await sw.checkHealth();
      }
      results.push(`${name.padEnd(8)} ${view.name}: ${out.path} in ${(out.ms / 1000).toFixed(1)}s, ${landed ? 'right channel' : 'WRONG CHANNEL'}, ${h?.state ?? 'no health'}${h?.detail ? ` (${h.detail})` : ''}`);
      if (h?.state !== 'PLAYING') results.push(await evidence(view.page, `${name}-${view.name}`));
    } catch (err) {
      results.push(`${name.padEnd(8)} ${view.name}: FAILED ${String(err).split('\n')[0]}`);
      results.push(await evidence(view.page, `${name}-${view.name}-failed`));
    }
  };
  // Channels on the same view go one after another (the second one exercises the in-app switch);
  // different views run side by side, limited by the Tuner like in the app.
  await Promise.all(
    Array.from({ length: Math.min(views, names.length) }, async (_, v) => {
      const sw = new ScreenWindow(v + 1, screens[v].page, tuner, cfg.windows, false, screens[v].name);
      for (let i = v; i < names.length; i += views) await tuneOne(names[i], i, sw);
    }),
  );
  log('results:');
  for (const r of results) console.log(`  ${r}`);
}

/** When a channel doesn't play: the page's URL, any error text the probe sees, and a screenshot. */
async function evidence(page: Page, label: string): Promise<string> {
  const dir = path.join(STATE_DIR, 'provider-check');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.png`);
  const shot = await page.screenshot({ path: file, timeout: 5000 }).then(() => file).catch((e) => `no screenshot (${String(e).split('\n')[0]})`);
  const frames = await probePage(page, errorRules(provider).probePatterns).catch(() => []);
  const lines = [...new Set(frames.flatMap((f) => f.errorLines))];
  const vids = frames.flatMap((f) => f.videos).map((v) => `${v.rect.w}x${v.rect.h} rs${v.readyState} t${v.currentTime.toFixed(1)}${v.paused ? ' paused' : ''}${v.error ? ` err ${v.error.code} ${v.error.message}` : ''}`);
  return `           url ${page.url().slice(0, 110)}\n           text ${lines.length ? lines.join(' | ').slice(0, 300) : '(no error text)'}\n           video ${vids.join('; ') || '(none)'}\n           ${shot}`;
}

log('done; closing the window');
shell.quit();
setTimeout(() => process.exit(0), 3500);
