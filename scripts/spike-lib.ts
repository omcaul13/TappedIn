// Shared helpers for the Phase 0 spikes.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { PROJECT_ROOT, type Config } from '../src/config';
import { HealthTracker, probePage, type Health } from '../src/windows/health';
import { LISTINGS_URL, tuneByGuide } from '../src/windows/tune';

export const REPORT_DIR = path.join(PROJECT_ROOT, 'spike-report');

export interface ChannelRef {
  name: string;
  /** Guide channel number (preferred: tuned by clicking the guide row). */
  number?: number;
  /** Direct URL (only for one-off tests). */
  url?: string;
}

export function resolveChannelArg(cfg: Config, arg: string): ChannelRef {
  if (/^https?:\/\//i.test(arg)) return { name: arg.slice(0, 40), url: arg };
  if (/^\d+$/.test(arg)) return { name: `ch ${arg}`, number: Number(arg) };
  for (const [name, entry] of Object.entries(cfg.channels)) {
    const hit = name.toLowerCase() === arg.toLowerCase() || entry.aliases.some((a) => a.toLowerCase() === arg.toLowerCase());
    if (!hit) continue;
    if (entry.number === null) throw new Error(`Channel "${name}" is not in your lineup (number: null in config).`);
    return { name, number: entry.number };
  }
  throw new Error(`Unknown channel "${arg}". Use a configured channel name, a channel number, or a full URL.`);
}

export function configuredChannels(cfg: Config): ChannelRef[] {
  return Object.entries(cfg.channels)
    .filter(([, e]) => e.number !== null)
    .map(([name, e]) => ({ name, number: e.number! }));
}

/** Stop any Xfinity player already open in other tabs so it doesn't use up a stream slot. */
export async function parkOtherPlayers(context: BrowserContext): Promise<number> {
  let parked = 0;
  for (const p of context.pages()) {
    if (!p.url().includes('/stream/live/')) continue;
    await p.goto(LISTINGS_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    parked++;
  }
  return parked;
}

/** Start tuning a page to a channel. Returns how long the guide step took (ms), if used. */
export async function tune(page: Page, ch: ChannelRef): Promise<{ guideMs: number | null; url: string }> {
  if (ch.number !== undefined) {
    const r = await tuneByGuide(page, ch.number);
    return { guideMs: r.ms, url: r.url };
  }
  await page.goto(ch.url!, { waitUntil: 'domcontentloaded', timeout: 45000 });
  return { guideMs: null, url: page.url() };
}

export { parseFlags } from '../src/cli';

export const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Navigate and wait until playing (or a terminal error / timeout). Logs each state change. */
export async function tuneAndWatch(page: Page, ch: ChannelRef, label: string, timeoutSec: number) {
  const tracker = new HealthTracker();
  const t0 = Date.now();
  const transitions: { atSec: number; state: string; detail: string }[] = [];
  let last = '';
  let navError: string | null = null;
  let guideMs: number | null = null;
  try {
    const r = await tune(page, ch);
    guideMs = r.guideMs;
    console.log(`${ts()} [${label}] ${ch.name}: guide click → ${r.url} (${guideMs ?? '-'} ms)`);
  } catch (err) {
    navError = String(err).split('\n')[0];
  }
  tracker.reset();
  let health: Health | null = null;
  let timeToPlayingSec: number | null = null;
  while ((Date.now() - t0) / 1000 < timeoutSec) {
    health = tracker.update(await probePage(page));
    if (health.state !== last) {
      const atSec = +((Date.now() - t0) / 1000).toFixed(1);
      transitions.push({ atSec, state: health.state, detail: health.detail });
      console.log(`${ts()} [${label}] ${ch.name}: ${health.state} @ ${atSec}s  ${health.detail}`);
      last = health.state;
    }
    if (health.state === 'PLAYING') {
      timeToPlayingSec = +((Date.now() - t0) / 1000).toFixed(1);
      break;
    }
    if (['STREAM_LIMIT', 'LOGIN_REQUIRED', 'CHANNEL_UNAVAILABLE', 'DRM_ERROR'].includes(health.state)) break;
    await sleep(1000);
  }
  return { channel: ch, navError, guideMs, timeToPlayingSec, final: health, transitions, tracker };
}

export async function gpuVideoDecode(browser: Browser): Promise<unknown> {
  try {
    const cdp = await browser.newBrowserCDPSession();
    const info = (await cdp.send('SystemInfo.getInfo')) as { gpu?: { featureStatus?: Record<string, string>; devices?: { deviceString?: string; vendorString?: string }[] } };
    await cdp.detach();
    return {
      video_decode: info.gpu?.featureStatus?.video_decode,
      gpu: info.gpu?.devices?.map((d) => d.deviceString || d.vendorString),
    };
  } catch (err) {
    return { error: String(err) };
  }
}

export function cpuLoadPercent(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'], { timeout: 15000 }, (err, stdout) =>
      resolve(err ? null : Number(stdout.trim()) || 0),
    );
  });
}

export async function screenshot(page: Page, name: string): Promise<string | null> {
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, name);
  try {
    await page.screenshot({ path: file, type: 'jpeg', quality: 55, timeout: 10000 });
    return file;
  } catch (err) {
    console.warn(`screenshot failed: ${err}`);
    return null;
  }
}

export function writeReport(name: string, data: unknown): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, name);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
