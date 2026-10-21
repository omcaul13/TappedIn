import type { Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { loadProviderConfig } from '../../src/providers/registry';
import type { ChannelRef, ProviderConfig, TuneTools } from '../../src/providers/types';
import { collectPath, createUrlAdapter, itemsFromJson, MARK_ROW, refFromText } from '../../src/providers/url/adapter';

const base = loadProviderConfig('xfinity-on-campus');
const cfg = (tuning: Record<string, unknown>, over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  ...base,
  id: 'test-url',
  family: 'url',
  shortName: 'Test',
  shell: { ...base.shell, playerUrl: '/livetv' },
  tuning,
  ...over,
});
const tuning = {
  watchUrl: 'https://watch.example.net/livetv?tmsid={ref}',
  refInUrl: '[?&]tmsid=(\\d+)',
  lineup: { mode: 'dom', guideUrl: 'https://watch.example.net/guide', row: 'li.row', ref: { selector: 'img', attr: 'src', pattern: '/guide/(\\d+)\\?' } },
};
const ch = (ref: string | null): ChannelRef => ({ name: 'ESPN', number: 3, callSign: null, ref });

function fakeTools(page: { url: () => string }) {
  const load = vi.fn(async (_p: Page, url: string) => {
    (page as { current?: string }).current = url;
  });
  const tools: TuneTools = { exclusive: (fn) => fn(), load, cached: () => null, remember: vi.fn(), forget: vi.fn() };
  return { tools, load };
}

describe('generic URL adapter', () => {
  const a = createUrlAdapter(cfg(tuning));

  it('extracts an id from text with the configured pattern', () => {
    expect(refFromText('https://x/guide/12345?w=80', '/guide/(\\d+)\\?')).toBe('12345');
    expect(refFromText('garbage', '/guide/(\\d+)\\?')).toBeNull();
    expect(refFromText('ABC123', null)).toBe('ABC123');
  });

  it('onChannel compares the id in the URL', () => {
    expect(a.onChannel('https://watch.example.net/livetv?tmsid=12345', ch('12345'))).toBe(true);
    expect(a.onChannel('https://watch.example.net/livetv?tmsid=999', ch('12345'))).toBe(false);
    expect(a.onChannel('https://watch.example.net/livetv?tmsid=999', ch(null))).toBe(true);
    expect(a.onChannel('https://watch.example.net/livetv', ch('12345'))).toBe(true);
    expect(a.isOnPlayer('https://watch.example.net/livetv?tmsid=1')).toBe(true);
    expect(a.isOnPlayer('https://watch.example.net/guide')).toBe(false);
  });

  it('tune loads the channel URL', async () => {
    const page = { url: () => (page as { current?: string }).current ?? 'about:blank' } as unknown as Page;
    const { tools, load } = fakeTools(page);
    const out = await a.tune(page, ch('12345'), tools);
    expect(load).toHaveBeenCalledWith(page, 'https://watch.example.net/livetv?tmsid=12345', 30000);
    expect(out.path).toBe('url');
  });

  it('tune without an id explains how to fix it', async () => {
    const page = { url: () => 'about:blank' } as unknown as Page;
    await expect(a.tune(page, ch(null), fakeTools(page).tools)).rejects.toThrow(/lineup scan/);
  });

  it('tune that lands on another channel fails', async () => {
    const page = { url: () => 'https://watch.example.net/livetv?tmsid=999' } as unknown as Page;
    const tools: TuneTools = { exclusive: (fn) => fn(), load: async () => {}, cached: () => null, remember: () => {}, forget: () => {} };
    await expect(a.tune(page, ch('12345'), tools)).rejects.toThrow(/instead of/);
  });

  it('rejects a config without the required tuning fields', () => {
    expect(() => createUrlAdapter(cfg({ watchUrl: 'https://x/{ref}' }))).toThrow(/tuning/);
  });
});

describe('reading channels from a guide API response', () => {
  it('collectPath walks objects and [] arrays', () => {
    const json = { ribbons: [{ tiles: [{ id: 'a' }, { id: 'b' }] }, { tiles: [{ id: 'c' }] }] };
    expect(collectPath(json, 'ribbons[].tiles[].id')).toEqual(['a', 'b', 'c']);
    expect(collectPath(json, 'missing[].x')).toEqual([]);
  });

  it('itemsFromJson reads ref, label and number via configured paths and checks the ref pattern', () => {
    const json = { channels: [{ guid: '0123456789abcdef0123456789abcdef', title: 'ESPN', num: 5 }, { guid: 'not-a-guid', title: 'Bad' }] };
    const items = itemsFromJson(json, { items: 'channels[]', ref: 'guid', label: 'title', number: 'num', refPattern: '^([0-9a-f]{32})$' });
    expect(items).toEqual([{ label: 'ESPN', number: 5, callSign: null, ref: '0123456789abcdef0123456789abcdef' }]);
  });

  it("Stream2's config reads its top-level channel array and finds the id in a /live/<id> URL", () => {
    const t = loadProviderConfig('stream2').tuning as { refInUrl: string; watchUrl: string; lineup: Parameters<typeof itemsFromJson>[1] };
    const items = itemsFromJson([{ identifier: 'espn-hd', title: 'ESPN', channelNumber: 201 }], t.lineup);
    expect(items).toEqual([{ label: 'ESPN', number: 201, callSign: null, ref: 'espn-hd' }]);
    expect(new RegExp(t.refInUrl).exec(t.watchUrl.replace('{ref}', 'espn-hd'))?.[1]).toBe('espn-hd');
  });
});

describe('guide-reading options', () => {
  it('itemsFromJson can require a path (Sling: only ribbons that can play)', () => {
    const json = { ribbons: [{ stitch_id: '0123456789abcdef0123456789abcdef', tiles: [{ actions: { PLAY_CONTENT: {}, DETAIL_VIEW: { adobe: { ChannelName: 'ESPN' } } } }] }, { stitch_id: 'fedcba9876543210fedcba9876543210', tiles: [{ actions: { DETAIL_VIEW: { adobe: { ChannelName: 'ESPN VOD' } } } }] }] };
    const items = itemsFromJson(json, { items: 'ribbons[]', ref: 'stitch_id', label: 'tiles[].actions.DETAIL_VIEW.adobe.ChannelName', number: null, refPattern: '^([0-9a-f]{32})$', require: 'tiles[].actions.PLAY_CONTENT' });
    expect(items.map((i) => i.label)).toEqual(['ESPN']);
  });

  it('refFromText cuts a label out with a pattern (YouTube TV "watch ESPN")', () => {
    expect(refFromText('watch ESPN', '^watch (.+)$')).toBe('ESPN');
  });
});

describe('tuning by guide clicks (Hulu, DIRECTV)', () => {
  const clickTuning = {
    click: { before: '#CHANNELS', target: { closest: '.row', selector: '.on-now' }, then: '.play' },
    lineup: { mode: 'dom', guideUrl: 'https://watch.example.net/guide', row: '.ch', ref: { attr: 'data-testid', pattern: '^ch-(.+)$' } },
  };

  function fakeClickPage(found: boolean) {
    const clicks: string[] = [];
    const page = {
      url: () => 'https://watch.example.net/watch/abc',
      waitForSelector: async () => {},
      evaluate: vi.fn(async () => found),
      locator: (sel: string) => ({ first: () => ({ waitFor: async () => {}, click: async () => void clicks.push(sel), dispatchEvent: async () => void clicks.push(`dom:${sel}`) }) }),
    } as unknown as Page;
    return { page, clicks };
  }

  it('opens the guide, presses the tab, clicks the marked row, then play', async () => {
    const a = createUrlAdapter(cfg(clickTuning));
    const { page, clicks } = fakeClickPage(true);
    const { tools, load } = fakeTools(page);
    const out = await a.tune(page, ch('espn'), tools);
    expect(load).toHaveBeenCalledWith(page, 'https://watch.example.net/guide', 30000);
    expect(clicks).toEqual(['#CHANNELS', '[data-tappedin-tune]', '.play']);
    expect(out.path).toBe('guide');
    expect(a.onChannel(out.url, ch('espn'))).toBe(true);
  });

  it('"dom" clicks with element.click(); a channel missing from the guide fails', async () => {
    const a = createUrlAdapter(cfg({ ...clickTuning, click: { then: '.play', how: 'dom' } }));
    const ok = fakeClickPage(true);
    await a.tune(ok.page, ch('espn'), fakeTools(ok.page).tools);
    expect(ok.clicks).toEqual(['dom:[data-tappedin-tune]', 'dom:.play']);
    const missing = fakeClickPage(false);
    await expect(a.tune(missing.page, ch('espn'), fakeTools(missing.page).tools)).rejects.toThrow(/isn't in the guide/);
  });

  it('needs a watchUrl or click with a DOM lineup', () => {
    expect(() => createUrlAdapter(cfg({ lineup: clickTuning.lineup }))).toThrow(/watchUrl/);
    expect(() => createUrlAdapter(cfg({ click: {}, lineup: { mode: 'static', channels: [{ label: 'ESPN', ref: 'espn' }] } }))).toThrow(/watchUrl/);
  });

  it('MARK_ROW marks the click target of the row whose id matches', async () => {
    const el = (attrs: Record<string, string>, kids: Record<string, unknown> = {}, up: Record<string, unknown> = {}) => {
      const a = { ...attrs };
      return { getAttribute: (k: string) => a[k] ?? null, setAttribute: (k: string, v: string) => void (a[k] = v), removeAttribute: (k: string) => void delete a[k], querySelector: (s: string) => kids[s] ?? null, closest: (s: string) => up[s] ?? null, scrollIntoView: () => {}, attrs: a };
    };
    const onNow = el({});
    const rows = [el({ 'data-testid': 'ch-cnn' }), el({ 'data-testid': 'ch-espn' }, {}, { '.row': el({}, { '.on-now': onNow }) })];
    const document = { querySelectorAll: (s: string) => (s === '.ch' ? rows : []), scrollingElement: { scrollTop: 0, clientHeight: 100, scrollHeight: 100 } };
    const run = new Function('document', `return (${MARK_ROW})`)(document) as (a: unknown) => Promise<boolean>;
    const l = { ...clickTuning.lineup, scrollContainer: null, maxScrolls: 0, settleMs: 0 };
    expect(await run({ l, target: clickTuning.click.target, ref: 'espn' })).toBe(true);
    expect(onNow.attrs['data-tappedin-tune']).toBe('1');
    expect(await run({ l, target: clickTuning.click.target, ref: 'fox' })).toBe(false);
  });
});

describe('a fixed lineup (ESPN)', () => {
  it('discoverLineup returns the configured channels without loading anything', async () => {
    const a = createUrlAdapter(cfg({ watchUrl: 'https://x/p?network={ref}', lineup: { mode: 'static', channels: [{ label: 'ESPN', ref: 'espn' }] } }));
    const page = { url: () => 'about:blank' } as unknown as Page;
    const { tools, load } = fakeTools(page);
    expect(await a.discoverLineup(page, tools)).toEqual([{ label: 'ESPN', number: null, callSign: null, ref: 'espn' }]);
    expect(load).not.toHaveBeenCalled();
  });
});
