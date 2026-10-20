import { describe, expect, it } from 'vitest';
import type { SimResult } from '../src/sim';
import { computeMetrics } from '../src/simMetrics';
import { T0, testConfig } from './helpers';

describe('per-sport sim report', () => {
  it('a home game without finals (tennis) counts for its own sport, not college football', () => {
    const cfg = testConfig();
    const screen = { home: 't1', sport: 'atp' as const, onHome: true, kind: 'home' as const };
    const res: SimResult = { homes: [{ screen: 1, gameId: 't1', game: 'A vs B', sport: 'atp' }], entries: [], violations: [], ruleCounts: {}, timeShare: {}, ticks: 2, startedAt: T0, endedAt: T0 + 4000, timeline: [{ at: T0, screens: [screen] }, { at: T0 + 2000, screens: [screen] }] };
    expect(computeMetrics('atp', res, new Map(), cfg, 90, 45, 'atp').screenHours).toBeGreaterThan(0);
    expect(computeMetrics('cfb', res, new Map(), cfg, 90, 45, 'cfb').screenHours).toBe(0);
  });
});
