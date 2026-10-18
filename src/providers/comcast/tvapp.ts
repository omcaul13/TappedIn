import type { Page } from 'playwright-core';
import { z } from 'zod';

// Comcast's "TV-APP" web player: Xfinity Stream (xfinity.com/stream) and, per PrismCast, Cox Contour.
// Findings from Xfinity on 10/17/2026:
//  - Live URLs look like /stream/live/<slug>/<id>/<CALLSIGN>. A URL saved earlier keeps playing that
//    channel's *current* program (Xfinity just rewrites the slug), so it's a valid fast path (~8-9 s).
//  - Changing the URL in-page (pushState) does NOT switch the stream; the old channel keeps playing.
//  - The player's own "Close Player" button returns to the guide without a reload (0.2 s); clicking the
//    next channel there has it playing in ~4.6 s. That's the fastest switch.
//  - The guide (/stream/listings) is one long page of 65px rows sorted by channel number, with only
//    ~17 rows rendered at a time, so we binary-search the scroll position for the row, then click it.
//  - The player has a hidden "Are you still watching? Continue" button for long sessions.
// Every selector, URL and timing comes from the provider config's `tuning` section.

export const ComcastTuningSchema = z.object({
  listingsUrl: z.string().url(),
  livePath: z.string(),
  row: z.string().default('tv-grid-row'),
  rowButton: z.string(),
  channelNumber: z.string(),
  channelNumberInRow: z.string().default('span.channel-number'),
  rowButtonInRow: z.string().default('a[role=button]'),
  rowLabelAttr: z.string().default('aria-label'),
  closePlayer: z.string(),
  continueWatching: z.string(),
  guideErrorPattern: z.string(),
  inAppTimeoutMs: z.number().int().positive().default(8000),
  guideTimeoutMs: z.number().int().positive().default(20000),
  pageTimeoutMs: z.number().int().positive().default(30000),
  closePlayerTimeoutMs: z.number().int().positive().default(5000),
  findRowMaxSteps: z.number().int().positive().default(30),
  findRowSettleMs: z.number().int().min(0).default(180),
  findRowHitSettleMs: z.number().int().min(0).default(120),
  findRowEmptyWaitMs: z.number().int().min(0).default(250),
  scanSettleMs: z.number().int().min(0).default(250),
  /** Live URLs end with the station's call sign (lets every tune verify where it landed). */
  callSignInUrl: z.boolean().default(true),
});
export type ComcastTuning = z.infer<typeof ComcastTuningSchema>;

export interface GuideResult {
  url: string;
  ms: number;
  rowLabel: string | null;
  steps: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class TvApp {
  private readonly liveRe: RegExp;

  constructor(
    readonly t: ComcastTuning,
    /** Service name for messages ("Xfinity"). */
    private readonly name: string,
  ) {
    this.liveRe = new RegExp(escapeRe(t.livePath));
  }

  isLive(url: string): boolean {
    return url.includes(this.t.livePath);
  }

  isGuide(url: string): boolean {
    return url.startsWith(this.t.listingsUrl);
  }

  /** Is this live URL on the channel with this call sign (…<livePath><slug>/<id>/<CALLSIGN>)? */
  onCallSign(url: string, callSign: string | null | undefined): boolean {
    if (!callSign || !this.t.callSignInUrl) return true;
    return new RegExp(`${escapeRe(this.t.livePath)}.*/${escapeRe(callSign)}(?:[?#]|$)`, 'i').test(url);
  }

  /** Runs in the page: binary search over document scroll until the row for `target` is on screen. */
  private findRowScript(): string {
    const t = this.t;
    // Only rows inside the viewport count: the virtual list recycles row elements off-screen.
    return `async (target) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const inView = () => [...document.querySelectorAll(${JSON.stringify(t.channelNumber)})]
    .map((s) => ({ n: Number(s.textContent.trim()), el: s, r: s.getBoundingClientRect() }))
    .filter((x) => !Number.isNaN(x.n) && x.r.height > 0 && x.r.bottom > 0 && x.r.top < innerHeight)
    .sort((a, b) => a.r.top - b.r.top);
  const se = document.scrollingElement;
  let lo = 0;
  let hi = se.scrollHeight;
  for (let step = 0; step < ${t.findRowMaxSteps}; step++) {
    const vs = inView();
    const hit = vs.find((x) => x.n === target);
    if (hit) {
      hit.el.scrollIntoView({ block: 'center' });
      await sleep(${t.findRowHitSettleMs});
      return { found: true, steps: step };
    }
    if (!vs.length) { await sleep(${t.findRowEmptyWaitMs}); continue; }
    for (let i = 1; i < vs.length; i++) {
      if (vs[i - 1].n < target && target < vs[i].n) return { found: false, steps: step, reason: 'channel ' + target + ' is not in this lineup' };
    }
    const min = vs[0].n;
    const max = vs[vs.length - 1].n;
    const half = se.clientHeight / 2;
    if (target > max) lo = se.scrollTop + half; else hi = se.scrollTop - half;
    if (lo > hi) return { found: false, steps: step, reason: 'channel ' + target + ' not found' };
    se.scrollTop = Math.floor((lo + hi) / 2);
    await sleep(${t.findRowSettleMs});
  }
  return { found: false, steps: ${t.findRowMaxSteps}, reason: 'gave up searching the guide' };
}`;
  }

  /**
   * Wait for guide rows. Xfinity's guide sometimes fails to load ("Something went wrong. Your guide
   * isn't loading right now… (TVAPP-00501)" with a Try Again button), seen when several tiles load it
   * at once: press Try Again, then reload, before giving up.
   */
  async waitForGuide(page: Page, timeoutMs = this.t.guideTimeoutMs): Promise<void> {
    const per = Math.max(5000, Math.floor(timeoutMs / 3));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.waitForSelector(this.t.channelNumber, { timeout: per });
        return;
      } catch {
        const tryAgain = page.getByRole('button', { name: /try again/i }).first();
        if (attempt === 0 && (await tryAgain.count().catch(() => 0))) await tryAgain.click({ timeout: 3000 }).catch(() => {});
        else await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }
    }
    const msg = await page.evaluate(`((document.body && document.body.innerText) || '').match(new RegExp(${JSON.stringify(this.t.guideErrorPattern)}))?.[0] ?? ''`).catch(() => '');
    throw new Error(`${this.name} guide didn't load${msg ? `: ${String(msg).trim().slice(0, 120)}` : ''}`);
  }

  /** On the guide page (already loaded): find the channel's row and click it. */
  async clickChannelInGuide(page: Page, channelNumber: number, timeoutMs = this.t.guideTimeoutMs): Promise<GuideResult> {
    const t0 = Date.now();
    await this.waitForGuide(page, timeoutMs);
    const r = (await page.evaluate(`(${this.findRowScript()})(${channelNumber})`)) as { found: boolean; steps: number; reason?: string };
    if (!r.found) throw new Error(`${this.name} guide: ${r.reason}`);
    const row = page.locator(this.t.rowButton, { has: page.locator(this.t.channelNumberInRow, { hasText: new RegExp(`^${channelNumber}$`) }) }).first();
    const rowLabel = await row.getAttribute(this.t.rowLabelAttr);
    await row.click();
    await page.waitForURL(this.liveRe, { timeout: timeoutMs });
    return { url: page.url(), ms: Date.now() - t0, rowLabel, steps: r.steps };
  }

  /** Load the guide (full page load) and click the channel. */
  async tuneByGuide(page: Page, channelNumber: number, timeoutMs = this.t.pageTimeoutMs): Promise<GuideResult> {
    const t0 = Date.now();
    if (!this.isGuide(page.url())) await page.goto(this.t.listingsUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const r = await this.clickChannelInGuide(page, channelNumber, timeoutMs);
    return { ...r, ms: Date.now() - t0 };
  }

  /** Press the player's own "Close Player" button: back to the guide without reloading the app. */
  async closePlayer(page: Page, timeoutMs = this.t.closePlayerTimeoutMs): Promise<boolean> {
    if (!this.isLive(page.url())) return false;
    const button = page.locator(this.t.closePlayer).first();
    try {
      if (!(await button.count())) return false;
      await button.dispatchEvent('click'); // works while the auto-hiding controls are invisible
      await page.waitForURL((u) => this.isGuide(u.href), { timeout: timeoutMs });
      await page.waitForSelector(this.t.channelNumber, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  /** Answer the "Are you still watching?" prompt with Continue. */
  async continueWatching(page: Page): Promise<boolean> {
    const button = page.locator(this.t.continueWatching).first();
    try {
      if (!(await button.count())) return false;
      await button.dispatchEvent('click');
      return true;
    } catch {
      return false;
    }
  }

  /** On the loaded guide: scroll top to bottom and read every row's channel number and label. */
  async readGuideRows(page: Page): Promise<{ number: number; label: string }[]> {
    await this.waitForGuide(page);
    const t = this.t;
    const js = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const se = document.scrollingElement;
  se.scrollTop = 0;
  await sleep(${t.scanSettleMs});
  const seen = new Map();
  for (let i = 0; i < 1000; i++) {
    for (const row of document.querySelectorAll(${JSON.stringify(t.row)})) {
      const n = Number((row.querySelector(${JSON.stringify(t.channelNumberInRow)})?.textContent || '').trim());
      if (Number.isNaN(n) || n <= 0 || seen.has(n)) continue;
      const btn = row.querySelector(${JSON.stringify(t.rowButtonInRow)});
      seen.set(n, ((btn && btn.getAttribute(${JSON.stringify(t.rowLabelAttr)})) || row.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200));
    }
    if (se.scrollTop + se.clientHeight >= se.scrollHeight - 2) break;
    se.scrollTop += Math.max(200, Math.floor(se.clientHeight * 0.8));
    await sleep(${t.scanSettleMs});
  }
  return [...seen].map(([number, label]) => ({ number, label }));
})()`;
    return (await page.evaluate(js)) as { number: number; label: string }[];
  }
}
