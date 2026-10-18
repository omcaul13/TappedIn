import type { Page } from 'playwright-core';
import { z } from 'zod';
import { compileRegex, type ChannelRef, type DiscoveredChannel, type ProviderAdapter, type ProviderConfig, type TuneOutcome, type TunePath, type TuneTools } from '../types';
import { collectPath } from '../url/adapter';
import { ComcastTuningSchema, TvApp } from './tvapp';

// Xfinity On Campus, Xfinity Stream and Cox Contour: the same Comcast TV-APP, different config.
// A channel change takes the fastest path that works:
//  1. already in the app: close the player (or use the open guide) and click the channel (~4.2 s);
//  2. a remembered live URL for the channel (~10-12 s);
//  3. load the guide and click (~12-15 s).
// Every tune checks the call sign at the end of the URL it landed on.

/**
 * The channel map the TV-APP downloads with its guide: every channel with its call sign, network
 * (company) name, number, HD flag and whether your plan includes it. Channels you aren't entitled to
 * are left out; HD ones get " HD" in their label so lineup matching prefers them.
 */
export function parseChannelMap(json: unknown): DiscoveredChannel[] {
  const out: DiscoveredChannel[] = [];
  for (const c of collectPath(json, '_embedded.channels[]') as Record<string, unknown>[]) {
    if (!c || c.entitled === false) continue;
    const callSign = typeof c.callSign === 'string' ? c.callSign : null;
    const network = typeof c['branchOf/company/callSign'] === 'string' ? (c['branchOf/company/callSign'] as string) : callSign;
    const n = Number(c.number);
    if (!network) continue;
    out.push({ label: `${network}${c.isHD === true ? ' HD' : ''}`, number: Number.isFinite(n) && n > 0 ? n : null, callSign, ref: null });
  }
  return out;
}

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
      const done = async (path: TunePath): Promise<TuneOutcome> => {
        if (!landed()) throw new Error(`${config.shortName} opened ${page.url().split('/').pop()} instead of ${ch.callSign ?? ch.number}`);
        tools.remember(ch, page.url());
        if (t.watchNowButton) await pressWatchNow(page, t.watchNowButton);
        return { path, ms: Date.now() - t0, url: page.url() };
      };
      // 1. Already in the app: close the player (or use the open guide) and click the channel.
      try {
        const inGuide = (app.isLive(page.url()) && (await app.closePlayer(page))) || (app.isGuide(page.url()) && (await page.locator(t.channelNumber).count()) > 0);
        if (inGuide) {
          await app.clickChannelInGuide(page, ch.number, t.inAppTimeoutMs);
          return await done('in-app');
        }
      } catch {
        // Something in the app was in the way (an open panel, a stale overlay): fall through to a page load.
      }
      // 2. A remembered URL for this channel.
      const cached = tools.cached(ch);
      if (cached && onChannel(cached, ch)) {
        await tools.load(page, cached, t.pageTimeoutMs);
        if (landed()) return await done('cached-url');
        if (!app.isLive(page.url())) tools.forget(ch);
      } else if (cached) {
        tools.forget(ch); // saved for the wrong channel
      }
      // 3. Load the guide and click.
      await tools.exclusive(() => app.tuneByGuide(page, ch.number));
      return await done('guide');
    },

    async warm(page: Page, tools: TuneTools): Promise<void> {
      if (appUrl.test(page.url())) return;
      await tools.exclusive(async () => {
        await page.goto(t.listingsUrl, { waitUntil: 'domcontentloaded', timeout: t.pageTimeoutMs });
        await app.waitForGuide(page, t.guideTimeoutMs);
      });
    },

    async discoverLineup(page: Page, tools: TuneTools) {
      // Best: the channel map the guide downloads (call signs, plan entitlement). Fallback: read the guide rows.
      const re = compileRegex(t.channelMapResponse);
      const map = page.waitForResponse((r) => re.test(r.url()) && r.status() === 200, { timeout: t.channelMapTimeoutMs }).then((r) => r.json()).catch(() => null);
      await tools.exclusive(() => page.goto(t.listingsUrl, { waitUntil: 'domcontentloaded', timeout: t.pageTimeoutMs }));
      const fromMap = parseChannelMap(await map);
      if (fromMap.length) return fromMap;
      const rows = await app.readGuideRows(page);
      return rows.map((r) => ({ label: r.label, number: r.number, callSign: null, ref: null }));
    },
  };
}

/** Press a visible "Watch Now" play button if the channel shows one (polls for a few seconds). */
async function pressWatchNow(page: Page, b: { selector: string; text: string; waitMs: number }): Promise<boolean> {
  const js = `(() => { const re = new RegExp(${JSON.stringify(b.text)}, 'i'); const el = [...document.querySelectorAll(${JSON.stringify(b.selector)})].find((e) => re.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0); if (!el) return false; el.click(); return true; })()`;
  const until = Date.now() + b.waitMs;
  while (Date.now() < until) {
    if (await page.evaluate(js).catch(() => false)) return true;
    await page.waitForTimeout(500).catch(() => {});
  }
  return false;
}
