// Plumbing self-test that needs no Xfinity login: a throwaway headless Chrome (separate temp
// profile + port) plays a public ESPN highlight MP4, and we check the health probe sees PLAYING,
// the overlay badge sits on top, and muting works.
//   npm run selftest
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config';
import { EspnClient, espnDateKey } from '../src/espn/client';
import { normalizeScoreboard } from '../src/espn/normalize';
import { connect, ensureChrome, openWindow } from '../src/windows/chrome';
import { BADGE_JS, HealthTracker, probePage, setMuted } from '../src/windows/health';
import { sleep } from './spike-lib';

const cfg = loadConfig();
cfg.chrome.debugPort = 9444;
cfg.chrome.profileDir = mkdtempSync(path.join(os.tmpdir(), 'tappedin-selftest-'));

// Find any highlight clip from today's games.
const client = new EspnClient(cfg.espn);
const sb = await client.scoreboard(espnDateKey());
let clip: string | null = null;
for (const g of normalizeScoreboard(sb.body, Date.now()).filter((x) => x.phase !== 'PRE').slice(0, 8)) {
  const s = (await client.summary(g.id)).body as { videos?: { links?: { source?: { href?: string } } }[] };
  clip = s.videos?.find((v) => v.links?.source?.href)?.links?.source?.href ?? null;
  if (clip) break;
}
if (!clip) throw new Error('No ESPN clip found to test with.');
console.log(`clip: ${clip}`);

await ensureChrome(cfg, ['--headless=new', '--window-size=768,456']);
const { browser, context } = await connect(cfg);
const page = await openWindow(cfg, browser, context, 'RZ-SELFTEST', false);
const html = `<body style="margin:0;background:#000"><nav>Sign in</nav><video autoplay loop playsinline style="width:100vw;height:100vh" src="${clip}"></video></body>`;
await page.goto(`data:text/html,${encodeURIComponent(html)}`);

const tracker = new HealthTracker();
let state = '';
for (let i = 0; i < 20 && state !== 'PLAYING'; i++) {
  await sleep(1000);
  const h = tracker.update(await probePage(page));
  if (h.state !== state) console.log(`health: ${h.state} ${h.detail}`);
  state = h.state;
}
const badge = (await page.evaluate(BADGE_JS)) as { onTop: boolean };
await setMuted(page, true);
const muted = (await probePage(page)).flatMap((f) => f.videos.map((v) => v.muted));

const results = { playing: state === 'PLAYING', badgeOnTop: badge.onTop, muteWorked: muted.length > 0 && muted.every(Boolean) };
console.log(results);
const cdp = await browser.newBrowserCDPSession();
await cdp.send('Browser.close').catch(() => {});
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
