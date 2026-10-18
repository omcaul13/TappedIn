import type { Page } from 'playwright-core';
import { z } from 'zod';
import { compileRegex, type ChannelRef, type ProviderAdapter, type ProviderConfig, type TuneOutcome, type TunePath, type TuneTools } from '../types';
import { ComcastTuningSchema, TvApp } from './tvapp';

// Xfinity On Campus, Xfinity Stream and Cox Contour: the same Comcast TV-APP, different config.
// A channel change takes the fastest path that works:
//  1. already in the app: close the player (or use the open guide) and click the channel (~4.2 s);
//  2. a remembered live URL for the channel (~10-12 s);
//  3. load the guide and click (~12-15 s).
// Every tune checks the call sign at the end of the URL it landed on.

export function createComcastAdapter(config: ProviderConfig): ProviderAdapter {
  const parsed = ComcastTuningSchema.safeParse(config.tuning);
  if (!parsed.success) throw new Error(`config/providers/${config.id}.json tuning: ${z.prettifyError(parsed.error)}`);
  const t = parsed.data;
  const app = new TvApp(t, config.shortName);
  const appUrl = compileRegex(config.shell.appUrl);

  const onChannel = (url: string, ch: ChannelRef) => app.onCallSign(url, ch.callSign);

  return {
    config,
    onChannel,
    isOnPlayer: (url) => app.isLive(url),
    isWarm: (page) => app.isGuide(page.url()),
    release: (page) => app.closePlayer(page),
    answerIdlePrompt: (page) => app.continueWatching(page),

    async tune(page: Page, ch: ChannelRef, tools: TuneTools): Promise<TuneOutcome> {
      const t0 = Date.now();
      const landed = () => app.isLive(page.url()) && onChannel(page.url(), ch);
      const done = (path: TunePath): TuneOutcome => {
        if (!landed()) throw new Error(`${config.shortName} opened ${page.url().split('/').pop()} instead of ${ch.callSign ?? ch.number}`);
        tools.remember(ch, page.url());
        return { path, ms: Date.now() - t0, url: page.url() };
      };
      // 1. Already in the app: close the player (or use the open guide) and click the channel.
      try {
        const inGuide = (app.isLive(page.url()) && (await app.closePlayer(page))) || (app.isGuide(page.url()) && (await page.locator(t.channelNumber).count()) > 0);
        if (inGuide) {
          await app.clickChannelInGuide(page, ch.number, t.inAppTimeoutMs);
          return done('in-app');
        }
      } catch {
        // Something in the app was in the way (an open panel, a stale overlay): fall through to a page load.
      }
      // 2. A remembered URL for this channel.
      const cached = tools.cached(ch);
      if (cached && onChannel(cached, ch)) {
        await tools.load(page, cached, t.pageTimeoutMs);
        if (landed()) return done('cached-url');
        if (!app.isLive(page.url())) tools.forget(ch);
      } else if (cached) {
        tools.forget(ch); // saved for the wrong channel
      }
      // 3. Load the guide and click.
      await tools.exclusive(() => app.tuneByGuide(page, ch.number));
      return done('guide');
    },

    async warm(page: Page, tools: TuneTools): Promise<void> {
      if (appUrl.test(page.url())) return;
      await tools.exclusive(async () => {
        await page.goto(t.listingsUrl, { waitUntil: 'domcontentloaded', timeout: t.pageTimeoutMs });
        await app.waitForGuide(page, t.guideTimeoutMs);
      });
    },

    async discoverLineup(page: Page, tools: TuneTools) {
      await tools.exclusive(async () => {
        if (!app.isGuide(page.url())) await page.goto(t.listingsUrl, { waitUntil: 'domcontentloaded', timeout: t.pageTimeoutMs });
      });
      const rows = await app.readGuideRows(page);
      return rows.map((r) => ({ label: r.label, number: r.number, callSign: null, ref: null }));
    },
  };
}
