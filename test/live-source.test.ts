import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveSource } from '../src/espn/source';
import { testConfig } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LiveSource', () => {
  it("doesn't keep a timer handle for every poll it ever slept (a 10-hour session would hold tens of thousands)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    const src = new LiveSource(testConfig(), { scoreboard: () => [], summary: () => {} }, { date: '20261017', interesting: () => [] });
    src.start();
    await vi.advanceTimersByTimeAsync(2 * 3600_000);
    const held = (src as unknown as { timers: { length?: number; size?: number } }).timers;
    // One pending sleep per loop (a scoreboard loop per sport + two summary loops), not one per poll.
    expect(held.size ?? held.length).toBeLessThan(40);
    src.stop();
  });
});
