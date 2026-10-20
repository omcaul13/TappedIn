import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { loadProviderConfig } from '../src/providers/registry';
import type { ChannelRef, ProviderAdapter } from '../src/providers/types';
import { WindowController } from '../src/windows/controller';
import { testConfig } from './helpers';

// The controller's screens are fakes: each tune and health check resolves when the test says so.
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
    healthChecks = 0;
    healthGate: Promise<void> | null = null;
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
          resolve({ path: 'url', ms: 1 });
        }),
      );
    }
    async checkHealth() {
      this.healthChecks++;
      await this.healthGate;
      this.lastHealth = this.health;
      return this.health;
    }
    async watchStart() {
      return { outcome: 'playing' };
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
    async release() {}
  }
  return { ScreenWindow: FakeScreen };
});

type Fake = { tunes: number[]; pending: (() => void)[]; health: { state: string; detail: string }; healthChecks: number; healthGate: Promise<void> | null; channel: number | null };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function controller(screens: number) {
  const { ScreenWindow } = (await import('../src/windows/screen')) as unknown as { ScreenWindow: { all: Fake[] } };
  ScreenWindow.all.length = 0;
  const base = loadProviderConfig('xfinity-on-campus');
  const adapter = { config: base, onChannel: () => true, isOnPlayer: () => false, isWarm: () => false } as unknown as ProviderAdapter;
  const events = { tuned: vi.fn(), streamProblem: vi.fn(), streamRecovered: vi.fn(), limitLearned: vi.fn(), info: vi.fn(), bridge: vi.fn(), switchTiming: vi.fn() };
  const c = new WindowController(testConfig(), {} as Browser, null, { dryRun: false, serverUrl: 'http://localhost:0', stateFile: '', cacheFile: path.join(mkdtempSync(path.join(tmpdir(), 'rz-ctl-')), 'urls.json'), adapter }, events);
  await c.attach(Array.from({ length: screens }, (_, i) => ({ name: `S${i + 1}`, page: {} as Page })));
  return { c, events, fakes: ScreenWindow.all };
}

const tune = (screen: number, channel: number) => ({ type: 'tune' as const, screen, gameId: `g${channel}`, channel, channelName: `CH${channel}` });

describe('WindowController', () => {
  it('a newer channel command wins over one still loading', async () => {
    const { c, fakes } = await controller(1);
    c.execute(tune(1, 801));
    c.execute(tune(1, 802)); // arrives while 801 is still loading
    await flush();
    fakes[0].pending.shift()!();
    await flush();
    fakes[0].pending.shift()!();
    await flush();
    expect(fakes[0].tunes).toEqual([801, 802]);
    expect(fakes[0].channel).toBe(802);
    expect(c.wantOf(1)).toMatchObject({ channel: 802 });
  });

  it('a stream-limit message while the others still buffer keeps their video', async () => {
    const { c, fakes } = await controller(4);
    for (let s = 1; s <= 4; s++) c.execute(tune(s, 800 + s));
    await flush();
    for (const f of fakes) f.pending.shift()!();
    await flush();
    for (const f of fakes.slice(0, 3)) f.health = { state: 'BUFFERING', detail: '' };
    fakes[3].health = { state: 'STREAM_LIMIT', detail: 'too many devices' };
    await c.tick();
    expect(c.streamLimit).toBe(3);
  });

  it('a slow health check is not overlapped by the next one', async () => {
    const { c, fakes } = await controller(2);
    for (let s = 1; s <= 2; s++) c.execute(tune(s, 800 + s));
    await flush();
    for (const f of fakes) f.pending.shift()!();
    await flush();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    for (const f of fakes) f.healthGate = gate;
    const first = c.tick();
    await c.tick(); // the 2 s timer fires again while the first check is still waiting
    expect(fakes.map((f) => f.healthChecks)).toEqual([1, 1]);
    open();
    await first;
  });
});
