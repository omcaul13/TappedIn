import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadProviderConfig } from '../src/providers/registry';
import type { ChannelRef, ProviderAdapter, TuneTools } from '../src/providers/types';
import { cacheFileFor, Tuner } from '../src/windows/tuner';

const ch = (number: number, name = `CH${number}`): ChannelRef => ({ name, number, callSign: null, ref: null });
const fakePage = (url = 'about:blank') => ({ url: () => url, goto: vi.fn(async () => null) }) as unknown as Page;
const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'rz-tuner-')), 'urls.json');

function fakeAdapter(tune: ProviderAdapter['tune'], timing: Partial<{ loadGapMs: number; maxParallelTunes: number }> = {}): ProviderAdapter {
  const base = loadProviderConfig('xfinity-on-campus');
  return {
    config: { ...base, timing: { ...base.timing, ...timing } },
    tune,
    onChannel: () => true,
    isOnPlayer: () => false,
    isWarm: () => false,
    warm: async () => {},
    release: async () => false,
    answerIdlePrompt: async () => false,
    discoverLineup: async () => [],
  };
}

afterEach(() => vi.useRealTimers());

describe('Tuner', () => {
  it('runs at most maxParallelTunes tunes at once', async () => {
    let running = 0;
    let peak = 0;
    const adapter = fakeAdapter(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return { path: 'url', ms: 20, url: 'x' };
    });
    const tuner = new Tuner(adapter, tmpFile(), { fastPath: true });
    await Promise.all([1, 2, 3, 4].map((n) => tuner.tune(fakePage(), ch(n))));
    expect(peak).toBe(2);
  });

  it('serializes page loads and leaves the configured gap after each', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    let tools!: TuneTools;
    const adapter = fakeAdapter(async (_p, _c, t) => {
      tools = t;
      return { path: 'url', ms: 0, url: 'x' };
    }, { loadGapMs: 3500 });
    const tuner = new Tuner(adapter, tmpFile(), { fastPath: true });
    await tuner.tune(fakePage(), ch(1));
    const a = tools.exclusive(async () => void events.push(`a@${Date.now()}`));
    const b = tools.exclusive(async () => void events.push(`b@${Date.now()}`));
    const t0 = Date.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([`a@${t0}`]);
    await vi.advanceTimersByTimeAsync(3499);
    expect(events.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([a, b]);
    expect(events).toEqual([`a@${t0}`, `b@${t0 + 3500}`]);
  });

  it('remembers and forgets channel URLs in the cache file (keyed by channel number)', async () => {
    const file = tmpFile();
    let tools!: TuneTools;
    const adapter = fakeAdapter(async (_p, _c, t) => {
      tools = t;
      return { path: 'url', ms: 0, url: 'x' };
    });
    const tuner = new Tuner(adapter, file, { fastPath: true });
    await tuner.tune(fakePage(), ch(849));
    tools.remember(ch(849), 'https://example/live/849');
    expect(JSON.parse(readFileSync(file, 'utf8'))['849'].url).toBe('https://example/live/849');
    expect(tools.cached(ch(849))).toBe('https://example/live/849');
    tuner.forget(849);
    expect(tools.cached(ch(849))).toBeNull();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({});
  });

  it('cached() is null when the fast path is off', async () => {
    let tools!: TuneTools;
    const tuner = new Tuner(fakeAdapter(async (_p, _c, t) => ((tools = t), { path: 'url', ms: 0, url: 'x' })), tmpFile(), { fastPath: false });
    await tuner.tune(fakePage(), ch(1));
    tools.remember(ch(1), 'https://example/1');
    expect(tools.cached(ch(1))).toBeNull();
  });

  it('cache file is per provider; XOC keeps legacy name', () => {
    expect(cacheFileFor('xfinity-on-campus', '/s')).toBe(path.join('/s', 'xfinity-urls.json'));
    expect(cacheFileFor('spectrum-tv', '/s')).toBe(path.join('/s', 'urls-spectrum-tv.json'));
  });
});
