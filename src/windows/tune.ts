import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';

// Xfinity Stream tuning. Findings from 10/17/2026:
//  - Live URLs look like /stream/live/<slug>/<id>/<CALLSIGN>. A URL saved earlier keeps playing that
//    channel's *current* program (Xfinity just rewrites the slug), so it's a valid fast path (~8-9 s).
//  - Changing the URL in-page (pushState) does NOT switch the stream; the old channel keeps playing.
//  - The player's own "Close Player" button returns to the guide without a reload (0.2 s); clicking the
//    next channel there has it playing in ~4.6 s. That's the fastest switch.
//  - The guide (/stream/listings) is one long page of 65px rows sorted by channel number, with only
//    ~17 rows rendered at a time, so we binary-search the scroll position for the row, then click it.
//  - The player has a hidden "Are you still watching? Continue" button for long sessions.
//  - Several Xfinity pages that start loading at the same moment can all end up on the channel of the
//    last one (seen in the one-window app at startup), so full page loads go one at a time, and every
//    tune checks the call sign at the end of the URL.

export const LISTINGS_URL = 'https://www.xfinity.com/stream/listings';
const ROW_BUTTON = 'tv-grid-row a[role=button]';
const NUMBER = 'tv-grid-row span.channel-number';

// Runs in the page: binary search over document scroll until the row for `target` is on screen.
// Only rows inside the viewport count: the virtual list recycles row elements off-screen.
const FIND_ROW = `async (target) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const inView = () => [...document.querySelectorAll('${NUMBER}')]
    .map((s) => ({ n: Number(s.textContent.trim()), el: s, r: s.getBoundingClientRect() }))
    .filter((x) => !Number.isNaN(x.n) && x.r.height > 0 && x.r.bottom > 0 && x.r.top < innerHeight)
    .sort((a, b) => a.r.top - b.r.top);
  const se = document.scrollingElement;
  let lo = 0;
  let hi = se.scrollHeight;
  for (let step = 0; step < 30; step++) {
    const vs = inView();
    const hit = vs.find((x) => x.n === target);
    if (hit) {
      hit.el.scrollIntoView({ block: 'center' });
      await sleep(120);
      return { found: true, steps: step };
    }
    if (!vs.length) { await sleep(250); continue; }
    for (let i = 1; i < vs.length; i++) {
      if (vs[i - 1].n < target && target < vs[i].n) return { found: false, steps: step, reason: 'channel ' + target + ' is not in this lineup' };
    }
    const min = vs[0].n;
    const max = vs[vs.length - 1].n;
    const half = se.clientHeight / 2;
    if (target > max) lo = se.scrollTop + half; else hi = se.scrollTop - half;
    if (lo > hi) return { found: false, steps: step, reason: 'channel ' + target + ' not found' };
    se.scrollTop = Math.floor((lo + hi) / 2);
    await sleep(180);
  }
  return { found: false, steps: 30, reason: 'gave up searching the guide' };
}`;

export interface GuideResult {
  url: string;
  ms: number;
  rowLabel: string | null;
  steps: number;
}

/**
 * Wait for guide rows. Xfinity's guide sometimes fails to load ("Something went wrong. Your guide
 * isn't loading right now… (TVAPP-00501)" with a Try Again button), seen when several tiles load it
 * at once: press Try Again, then reload, before giving up.
 */
export async function waitForGuide(page: Page, timeoutMs = 20000): Promise<void> {
  const per = Math.max(5000, Math.floor(timeoutMs / 3));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForSelector(NUMBER, { timeout: per });
      return;
    } catch {
      const tryAgain = page.getByRole('button', { name: /try again/i }).first();
      if (attempt === 0 && (await tryAgain.count().catch(() => 0))) await tryAgain.click({ timeout: 3000 }).catch(() => {});
      else await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  const msg = await page.evaluate(`((document.body && document.body.innerText) || '').match(/[^\\n]*TVAPP-\\d+[^\\n]*|Something went wrong[^\\n]*/)?.[0] ?? ''`).catch(() => '');
  throw new Error(`Xfinity guide didn't load${msg ? `: ${String(msg).trim().slice(0, 120)}` : ''}`);
}

/** On the guide page (already loaded): find the channel's row and click it. */
export async function clickChannelInGuide(page: Page, channelNumber: number, timeoutMs = 20000): Promise<GuideResult> {
  const t0 = Date.now();
  await waitForGuide(page, timeoutMs);
  const r = (await page.evaluate(`(${FIND_ROW})(${channelNumber})`)) as { found: boolean; steps: number; reason?: string };
  if (!r.found) throw new Error(`Xfinity guide: ${r.reason}`);
  const row = page.locator(ROW_BUTTON, { has: page.locator('span.channel-number', { hasText: new RegExp(`^${channelNumber}$`) }) }).first();
  const rowLabel = await row.getAttribute('aria-label');
  await row.click();
  await page.waitForURL(/\/stream\/live\//, { timeout: timeoutMs });
  return { url: page.url(), ms: Date.now() - t0, rowLabel, steps: r.steps };
}

/** Load the guide (full page load) and click the channel. */
export async function tuneByGuide(page: Page, channelNumber: number, timeoutMs = 30000): Promise<GuideResult> {
  const t0 = Date.now();
  if (!page.url().startsWith(LISTINGS_URL)) await page.goto(LISTINGS_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const r = await clickChannelInGuide(page, channelNumber, timeoutMs);
  return { ...r, ms: Date.now() - t0 };
}

/** Press the player's own "Close Player" button: back to the guide without reloading the app. */
export async function closePlayer(page: Page, timeoutMs = 5000): Promise<boolean> {
  if (!page.url().includes('/stream/live/')) return false;
  const button = page.locator('#player button[aria-label="Close Player"]').first();
  try {
    if (!(await button.count())) return false;
    await button.dispatchEvent('click'); // works while the auto-hiding controls are invisible
    await page.waitForURL((u) => u.href.startsWith(LISTINGS_URL), { timeout: timeoutMs });
    await page.waitForSelector(NUMBER, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/** Answer Xfinity's "Are you still watching?" prompt with Continue. */
export async function continueWatching(page: Page): Promise<boolean> {
  const button = page.locator('#player button[aria-label^="Are you still watching? Continue"]').first();
  try {
    if (!(await button.count())) return false;
    await button.dispatchEvent('click');
    return true;
  } catch {
    return false;
  }
}

/** Is this live URL on the channel with this call sign (…/stream/live/<slug>/<id>/<CALLSIGN>)? */
export function onCallSign(url: string, callSign: string | null | undefined): boolean {
  if (!callSign) return true;
  return new RegExp(`/stream/live/.*/${callSign}(?:[?#]|$)`, 'i').test(url);
}

/** Pause after an Xfinity page load before the next one may start. */
const LOAD_GAP_MS = 3500;

export type TunePath = 'in-app' | 'cached-url' | 'guide';

export interface TuneOutcome {
  path: TunePath;
  ms: number;
  url: string;
}

/**
 * Picks the fastest way to put a channel on a tile, remembering each channel's live URL on disk so
 * later switches (even across restarts) can skip the guide.
 */
export class Tuner {
  private cache: Record<string, { url: string; savedAt: string }> = {};
  /** At most two tunes at once: four simultaneous guide loads made Xfinity's guide API fail. */
  private slots = 2;
  private waiting: (() => void)[] = [];
  /** Full Xfinity page loads, one at a time (see the header). */
  private loads: Promise<void> = Promise.resolve();

  constructor(
    private readonly cacheFile: string,
    private readonly opts: { fastPath: boolean },
  ) {
    try {
      this.cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
      this.cache = {};
    }
  }

  /** Drop a remembered URL (e.g. it didn't play). */
  forget(channel: number): void {
    if (!(channel in this.cache)) return;
    delete this.cache[channel];
    this.save();
  }

  /** Tune `page` to a channel; `callSign` (from the lineup config) lets the tuner verify where it landed. */
  async tune(page: Page, channel: number, callSign?: string | null): Promise<TuneOutcome> {
    if (this.slots === 0) await new Promise<void>((r) => this.waiting.push(r));
    else this.slots--;
    try {
      return await this.tuneNow(page, channel, callSign ?? null);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.slots++;
    }
  }

  /** Open Xfinity's guide in a spare view (no stream), so its first channel change is a quick in-app click. */
  async warmGuide(page: Page): Promise<void> {
    if (page.url().includes('xfinity.com/stream')) return;
    await this.oneLoadAtATime(async () => {
      await page.goto(LISTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForGuide(page, 20000);
    });
  }

  /** Run a full Xfinity page load with no other one in progress, then leave a gap before the next. */
  private async oneLoadAtATime<T>(fn: () => Promise<T>): Promise<T> {
    const before = this.loads;
    let release!: () => void;
    this.loads = new Promise<void>((r) => (release = r));
    await before;
    try {
      return await fn();
    } finally {
      setTimeout(release, LOAD_GAP_MS);
    }
  }

  private async tuneNow(page: Page, channel: number, callSign: string | null): Promise<TuneOutcome> {
    const t0 = Date.now();
    const landed = () => page.url().includes('/stream/live/') && onCallSign(page.url(), callSign);
    const done = (p: TunePath): TuneOutcome => {
      if (!landed()) throw new Error(`Xfinity opened ${page.url().split('/').pop()} instead of ${callSign ?? channel}`);
      this.remember(channel, page.url());
      return { path: p, ms: Date.now() - t0, url: page.url() };
    };
    // 1. Already in the Xfinity app: close the player (or use the open guide) and click the channel.
    try {
      const inGuide = (page.url().includes('/stream/live/') && (await closePlayer(page))) || (page.url().startsWith(LISTINGS_URL) && (await page.locator(NUMBER).count()) > 0);
      if (inGuide) {
        await clickChannelInGuide(page, channel, 8000);
        return done('in-app');
      }
    } catch {
      // Something in the app was in the way (an open panel, a stale overlay): fall through to a page load.
    }
    // 2. A remembered URL for this channel.
    const cached = this.opts.fastPath ? this.cache[channel]?.url : undefined;
    if (cached && onCallSign(cached, callSign)) {
      await this.oneLoadAtATime(() => page.goto(cached, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      if (landed()) return done('cached-url');
      if (!page.url().includes('/stream/live/')) this.forget(channel);
    } else if (cached) {
      this.forget(channel); // saved for the wrong channel
    }
    // 3. Load the guide and click.
    await this.oneLoadAtATime(() => tuneByGuide(page, channel));
    return done('guide');
  }

  private remember(channel: number, url: string): void {
    if (!url.includes('/stream/live/') || this.cache[channel]?.url === url) return;
    this.cache[channel] = { url, savedAt: new Date().toISOString() };
    this.save();
  }

  private save(): void {
    mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
  }
}
