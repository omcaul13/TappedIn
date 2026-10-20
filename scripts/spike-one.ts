// Phase 0 spike: one tile window.
//   npm run spike:one -- ESPN                 # play one channel
//   npm run spike:one -- ESPN ESPN2 ABC       # then switch channels, timing each switch
//   npm run spike:one -- <url> --app          # use a chrome-less --app window
//
// Checks: plays (currentTime advancing), Widevine present, navigator.webdriver, the injected badge
// is visible over the player, muting works, time from navigation to playing, and the DOM path
// to the <video> (for the "fill the tile" CSS later).
import { loadConfig } from '../src/config';
import { connect, debugEndpoint, gridBounds, openWindow, setWindowBounds, workArea } from '../src/windows/chrome';
import { BADGE_JS, probePage, setMuted, WIDEVINE_JS } from '../src/windows/health';
import { configuredChannels, gpuVideoDecode, parkOtherPlayers, parseFlags, resolveChannelArg, screenshot, sleep, ts, tuneAndWatch, writeReport } from './spike-lib';

const cfg = loadConfig();
const { positional, flags } = parseFlags(process.argv.slice(2));
const app = flags.app === true;
const timeoutSec = Number(flags.timeout ?? 45);
const channels = positional.length ? positional.map((a) => resolveChannelArg(cfg, a)) : configuredChannels(cfg).slice(0, 1);
if (!channels.length) {
  console.error('No channel given and none configured. Usage: npm run spike:one -- <channel name | url> [more channels] [--app]');
  process.exit(1);
}
if (!(await debugEndpoint(cfg))) {
  console.error('TappedIn Chrome is not running. Run `npm run login` first and sign in.');
  process.exit(1);
}

const { browser, context } = await connect(cfg);
const parked = await parkOtherPlayers(context);
if (parked) console.log(`${ts()} stopped ${parked} player tab(s) that were already open`);
const page = await openWindow(cfg, browser, context, 'RZ-SPIKE-1', app);
const area = await workArea(page);
await setWindowBounds(page, gridBounds(area)[0]);
console.log(`${ts()} window open (${app ? 'app mode' : 'normal'}), work area ${area.width}x${area.height} @ dpr ${area.dpr}`);

const runs = [];
for (const [i, ch] of channels.entries()) {
  const run = await tuneAndWatch(page, ch, i === 0 ? 'tune' : `switch ${i}`, timeoutSec);
  runs.push({ channel: ch.name, number: ch.number, url: page.url(), navError: run.navError, guideMs: run.guideMs, timeToPlayingSec: run.timeToPlayingSec, final: run.final?.state, detail: run.final?.detail, transitions: run.transitions });
  if (i < channels.length - 1) await sleep(5000);
}

// Checks on whatever is playing now.
const widevine = await page.evaluate(WIDEVINE_JS).catch((e) => ({ ok: false, error: String(e) }));
const badge = await page.evaluate(BADGE_JS).catch((e) => ({ injected: false, error: String(e) }));
await setMuted(page, true);
await sleep(3000);
const afterMute = (await probePage(page)).flatMap((f) => f.videos.map((v) => v.muted));
await setMuted(page, false);
const frames = await probePage(page);
const top = frames.find((f) => f.isTop);
const withVideo = frames.find((f) => f.videos.length);
const shot = await screenshot(page, `spike-one-${Date.now()}.jpg`);
const gpu = await gpuVideoDecode(browser);

const report = {
  at: new Date().toISOString(),
  windowMode: app ? 'app' : 'normal',
  workArea: area,
  runs,
  widevine,
  webdriver: top?.webdriver,
  overlayBadge: badge,
  fullscreen: top?.fullscreen,
  muteWorked: afterMute.length > 0 && afterMute.every(Boolean),
  viewport: top?.viewport,
  videoFrame: withVideo ? { url: withVideo.url, isTop: withVideo.isTop, videos: withVideo.videos, ancestors: withVideo.largestVideoAncestors } : null,
  frameUrls: frames.map((f) => f.url.slice(0, 100)),
  gpu,
  screenshot: shot,
};
const file = writeReport(`spike-one-${Date.now()}.json`, report);

console.log('\n=== spike:one summary ===');
for (const r of runs) console.log(`${r.channel.padEnd(14)} ${String(r.final).padEnd(18)} guide click: ${r.guideMs ?? '—'} ms  time-to-playing: ${r.timeToPlayingSec ?? '—'}s  ${r.navError ?? ''}`);
console.log(`Widevine: ${JSON.stringify(widevine)}`);
console.log(`navigator.webdriver: ${top?.webdriver}   overlay badge on top: ${(badge as { onTop?: boolean }).onTop}   mute worked: ${report.muteWorked}`);
console.log(`GPU: ${JSON.stringify(gpu)}`);
console.log(`Report: ${file}`);
process.exit(0);
