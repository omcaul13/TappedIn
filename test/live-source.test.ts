import { afterEach, describe, expect, it, vi } from 'vitest';
import { slateDateKey } from '../src/espn/client';
import { LiveSource } from '../src/espn/source';
import { sportOf } from '../src/sports';
import type { GameSnapshot } from '../src/engine/types';
import { testConfig } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LiveSource', () => {
  it("doesn't keep a timer handle for every poll it ever slept (a 10-hour session would hold tens of thousands)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    const src = new LiveSource(testConfig(), { scoreboard: () => [], summary: () => {} }, { date: () => '20261017', interesting: () => [] });
    src.start();
    await vi.advanceTimersByTimeAsync(2 * 3600_000);
    const held = (src as unknown as { timers: { length?: number; size?: number } }).timers;
    // One pending sleep per loop (a scoreboard loop per sport + two summary loops), not one per poll.
    expect(held.size ?? held.length).toBeLessThan(40);
    src.stop();
  });

  it('keeps the live cadence after a failed poll and asks for the day again on every poll', async () => {
    vi.useFakeTimers();
    const cfg = testConfig();
    const sport = cfg.sports.enabled[0];
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      // The first scoreboard of each sport works; every later one fails (ESPN 503s).
      const first = urls.filter((u) => u.split('?')[0] === url.split('?')[0]).length === 1;
      return new Response(JSON.stringify({ events: [] }), { status: first ? 200 : 503 });
    });
    let day = '20261017';
    const live = [{ id: '1', phase: 'LIVE' } as GameSnapshot];
    const src = new LiveSource(cfg, { scoreboard: (_b, _at, s) => (s === sport ? live : []), summary: () => {} }, { date: () => day, interesting: () => [] });
    src.start();
    await vi.advanceTimersByTimeAsync(30_000);
    day = '20261018';
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    src.stop();
    const mine = urls.filter((u) => u.includes(`/${sportOf(sport).espn.path}/scoreboard?`));
    // At the 60 s idle rate it would be ~5 polls x 3 tries; at the 12 s live rate far more.
    expect(mine.length).toBeGreaterThan(30);
    expect(mine.some((u) => u.includes('dates=20261018'))).toBe(true);
  });
});

describe('slateDateKey', () => {
  it("stays on the evening's slate until 06:00 ET", () => {
    expect(slateDateKey(Date.parse('2026-10-18T00:30:00-04:00'))).toBe('20261017');
    expect(slateDateKey(Date.parse('2026-10-18T06:30:00-04:00'))).toBe('20261018');
  });
});
