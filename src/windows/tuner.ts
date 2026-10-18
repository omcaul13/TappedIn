import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import type { ChannelRef, ProviderAdapter, TuneOutcome, TuneTools } from '../providers/types';

// Service-independent part of changing channels; the provider adapter does the site-specific part.
//  - At most `timing.maxParallelTunes` channel changes at once (four simultaneous Xfinity guide loads
//    made its guide API fail).
//  - Full page loads go one at a time with `timing.loadGapMs` after each: several Xfinity pages that
//    start loading at the same moment can all end up on the channel of the last one.
//  - Each channel's live URL is remembered on disk (per provider), so later switches, even across
//    restarts, can skip the guide.

/** Remembered channel URLs for a provider. Xfinity On Campus keeps its original file name. */
export function cacheFileFor(providerId: string, stateDir: string): string {
  return path.join(stateDir, providerId === 'xfinity-on-campus' ? 'xfinity-urls.json' : `urls-${providerId}.json`);
}

export class Tuner {
  private cache: Record<string, { url: string; savedAt: string }> = {};
  private slots: number;
  private waiting: (() => void)[] = [];
  private loads: Promise<void> = Promise.resolve();
  readonly tools: TuneTools;

  constructor(
    readonly adapter: ProviderAdapter,
    private readonly cacheFile: string,
    private readonly opts: { fastPath: boolean },
  ) {
    this.slots = adapter.config.timing.maxParallelTunes;
    try {
      this.cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
      this.cache = {};
    }
    this.tools = {
      exclusive: (fn) => this.oneLoadAtATime(fn),
      load: (page, url, timeoutMs = 30000) => this.oneLoadAtATime(async () => void (await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }))),
      cached: (ch) => (this.opts.fastPath ? (this.cache[ch.number]?.url ?? null) : null),
      remember: (ch, url) => this.remember(ch.number, url),
      forget: (ch) => this.forget(ch.number),
    };
  }

  /** Drop a remembered URL (e.g. it didn't play). */
  forget(channel: number): void {
    if (!(channel in this.cache)) return;
    delete this.cache[channel];
    this.save();
  }

  /** Tune `page` to a channel. */
  async tune(page: Page, ch: ChannelRef): Promise<TuneOutcome> {
    if (this.slots === 0) await new Promise<void>((r) => this.waiting.push(r));
    else this.slots--;
    try {
      return await this.adapter.tune(page, ch, this.tools);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.slots++;
    }
  }

  /** Park a spare view on the service's guide (no stream), so its first channel change is quick. */
  async warm(page: Page): Promise<void> {
    await this.adapter.warm(page, this.tools);
  }

  /** Run a full page load with no other one in progress, then leave a gap before the next. */
  private async oneLoadAtATime<T>(fn: () => Promise<T>): Promise<T> {
    const before = this.loads;
    let release!: () => void;
    this.loads = new Promise<void>((r) => (release = r));
    await before;
    try {
      return await fn();
    } finally {
      setTimeout(release, this.adapter.config.timing.loadGapMs);
    }
  }

  private remember(channel: number, url: string): void {
    if (this.cache[channel]?.url === url) return;
    this.cache[channel] = { url, savedAt: new Date().toISOString() };
    this.save();
  }

  private save(): void {
    mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
  }
}
