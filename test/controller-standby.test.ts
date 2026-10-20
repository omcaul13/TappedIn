import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { loadProviderConfig } from '../src/providers/registry';
import type { ChannelRef, ProviderAdapter } from '../src/providers/types';
import { WindowController } from '../src/windows/controller';
import { testConfig } from './helpers';

// Standby views with fake screens: tunes resolve when the test says so, and a standby view's
// watchStart keeps waiting (like the real one) until it's superseded or the test ends it.
vi.mock('../src/windows/screen', () => {
  class FakeScreen {
    static all: FakeScreen[] = [];
    render = 'none';
    channel: number | null = null;
    ref = null;
    localUrl = null;
    lastTune = null;
    lastHealth: { state: string; detail: string } | null = null;
    popupVisible = true;
    tracker = { reset() {} };
    page = { url: () => 'about:blank' };
    tunes: number[] = [];
    pending: (() => void)[] = [];
    health: { state: string; detail: string } = { state: 'PLAYING', detail: '' };
    start: 'wait' | 'timeout' = 'wait';
    released = 0;
    constructor(
      public id: number,
      _page: unknown,
      _tuner: unknown,
      _cfg: unknown,
      _inPage: boolean,
      readonly viewName: string | null,
    ) {
      FakeScreen.all.push(this);
    }
    tuneChannel(ref: ChannelRef) {
      this.tunes.push(ref.number);
      return new Promise((resolve) =>
        this.pending.push(() => {
          this.render = 'video';
          this.channel = ref.number;
          resolve({ path: 'in-app', ms: 1 });
        }),
      );
    }
    async checkHealth() {
      if (this.render !== 'video') return null;
      this.lastHealth = this.health;
      return this.health;
    }
    async watchStart(_before: unknown, _timeoutMs: number, stillCurrent: () => boolean) {
      if (this.start === 'timeout') return { firstFrameAt: null, playingAt: null, outcome: 'timeout' };
      for (;;) {
        if (!stillCurrent()) return { firstFrameAt: null, playingAt: null, outcome: 'superseded' };
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    async showLocal(url: string) {
      this.render = 'local';
      this.localUrl = url as never;
    }
    async currentSrc() {
      return null;
    }
    async setMuted() {}
    async setOverlay() {}
    async release() {
      this.released++;
      this.render = 'none';
      this.channel = null;
    }
  }
  return { ScreenWindow: FakeScreen };
});

type Fake = { tunes: number[]; pending: (() => void)[]; health: { state: string; detail: string }; start: 'wait' | 'timeout'; released: number; channel: number | null };
const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 10));
};
const tune = (screen: number, channel: number) => ({ type: 'tune' as const, screen, gameId: `g${channel}`, channel, channelName: `CH${channel}` });

/** One screen playing its home game (801) and one free standby view. */
async function homeWithSpare() {
  const { ScreenWindow } = (await import('../src/windows/screen')) as unknown as { ScreenWindow: { all: Fake[] } };
  ScreenWindow.all.length = 0;
  const base = loadProviderConfig('xfinity-on-campus');
  const adapter = { config: base, onChannel: () => true, isOnPlayer: () => false, isWarm: () => false, warm: async () => {} } as unknown as ProviderAdapter;
  const events = { tuned: vi.fn(), streamProblem: vi.fn(), streamRecovered: vi.fn(), limitLearned: vi.fn(), info: vi.fn(), bridge: vi.fn(), switchTiming: vi.fn() };
  const opts = { dryRun: false, serverUrl: 'http://localhost:0', stateFile: '', cacheFile: path.join(mkdtempSync(path.join(tmpdir(), 'rz-sb-')), 'urls.json'), adapter };
  const c = new WindowController(testConfig(), {} as Browser, null, opts, events);
  await c.attach([{ name: 'S1', page: {} as Page }], [{ name: 'X1', page: {} as Page }], () => {});
  const [front, spare] = ScreenWindow.all;
  c.setHomeChannel(1, 801);
  c.execute(tune(1, 801));
  await flush();
  front.pending.shift()!();
  await flush();
  await c.tick(); // front is PLAYING its home game
  return { c, events, front, spare };
}

describe('WindowController standby views', () => {
  it('a newer command ends a standby load that is still waiting to play', async () => {
    const { c, front, spare } = await homeWithSpare();
    c.execute(tune(1, 802)); // leave home: 802 loads in the standby view
    await flush();
    spare.pending.shift()!();
    await flush();
    expect(c.switchingOf(1)).toMatchObject({ gameId: 'g802', background: true });
    c.execute(tune(1, 801)); // back home before 802 plays
    await flush();
    expect(c.switchingOf(1)).toBeNull();
    expect(spare.released).toBe(1);
    expect(front.tunes).toEqual([801]);
    expect(c.screens[0]).toBe(front as never);
  });

  it('a stream limit in the standby view turns standby off and switches in place', async () => {
    const { c, events, front, spare } = await homeWithSpare();
    spare.start = 'timeout';
    spare.health = { state: 'STREAM_LIMIT', detail: 'too many devices' };
    c.execute(tune(1, 802));
    await flush();
    spare.pending.shift()!();
    await flush();
    expect(events.info).toHaveBeenCalledWith(expect.stringMatching(/standby views off/));
    front.pending.shift()!(); // switched in place
    await flush();
    expect(front.tunes).toEqual([801, 802]);
    // The next substitute doesn't try the standby view again.
    c.execute(tune(1, 803));
    await flush();
    expect(spare.tunes).toEqual([802]);
    expect(front.tunes).toEqual([801, 802, 803]);
  });
});
