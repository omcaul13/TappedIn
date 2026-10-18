import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { etTime, runSim } from '../src/sim';
import { FIXTURES } from './helpers';

// Golden replay: the real director over 30 minutes of real ESPN data recorded on 2026-10-17
// (18:45–19:15 ET, late 4th quarters: lots of timeouts, scores and finishes).
// We don't snapshot exact switches (thresholds will be tuned); we check the rules always hold.

const cfg = loadConfig();
const date = '20261017';

describe('golden replay 2026-10-17 18:45–19:15', async () => {
  const res = await runSim(cfg, { root: PROJECT_ROOT, date, dir: path.join(FIXTURES, `replay-${date}`), fromMs: etTime(date, '18:45') });
  const decisions = res.entries.flatMap((e) => (e.type === 'decision' ? [e] : []));

  it('picks four watchable home games', () => {
    expect(res.homes).toHaveLength(4);
  });

  it('never breaks an invariant (no duplicates, dwell respected, lineup only, fill-ins only during breaks)', () => {
    expect(res.violations).toEqual([]);
  });

  it('every decision carries its reasons', () => {
    expect(decisions.length).toBeGreaterThan(20);
    for (const d of decisions) {
      expect(d.reasons.length).toBeGreaterThan(0);
      expect(d.reasons.every((r) => r.trim().length > 0)).toBe(true);
    }
  });

  it('exercises the main rules', () => {
    for (const rule of ['BREAK_FILL', 'RETURN_HOME', 'GAME_OVER', 'AUTO_PICK']) expect(res.ruleCounts[rule] ?? 0, rule).toBeGreaterThan(0);
  });

  it('home games still get most of the screen time', () => {
    for (const h of res.homes) {
      const share = res.timeShare[h.screen];
      const total = Object.values(share).reduce((a, b) => a + b, 0);
      expect((share.home ?? 0) / total, `S${h.screen}`).toBeGreaterThan(0.4);
    }
  });
});

describe('switch less: forecast Low vs classic on the same synthesized day', async () => {
  const run = async (mut: (c: typeof cfg) => void) => {
    const c = structuredClone(cfg);
    mut(c);
    const res = await runSim(c, { root: PROJECT_ROOT, date, dir: path.join(FIXTURES, `finals-${date}`), synth: true });
    const auto = res.entries.filter((e) => e.type === 'decision' && e.switched && e.auto && e.rule !== 'HOME_SYNC').length;
    return { res, auto };
  };
  const classic = await run((c) => (c.switching.breakModel = 'classic'));
  const low = await run((c) => {
    c.switching.breakModel = 'forecast';
    c.switching.sensitivity = 'low';
  });

  it('Low switches clearly less (at most 75% of classic) and keeps every invariant', () => {
    expect(classic.auto).toBeGreaterThan(100);
    expect(low.auto).toBeLessThanOrEqual(classic.auto * 0.75);
    expect(low.res.violations).toEqual([]);
  });

  it('Low still fills breaks, and rarely hops to a third game', () => {
    expect(low.res.ruleCounts.BREAK_FILL ?? 0).toBeGreaterThan(50);
    expect(low.res.ruleCounts.FILL_UPGRADE ?? 0).toBe(0);
    expect(low.res.ruleCounts.FILL_REPLACE ?? 0).toBeLessThan((classic.res.ruleCounts.FILL_REPLACE ?? 0) / 2);
  });
});

describe('synthesized day from final play-by-play', async () => {
  const res = await runSim(cfg, { root: PROJECT_ROOT, date, dir: path.join(FIXTURES, `finals-${date}`), synth: true });

  it('runs a whole game day with halftime and game-over handling', () => {
    expect(res.homes.length).toBeGreaterThan(0);
    expect(res.violations).toEqual([]);
    expect(res.ruleCounts.HALFTIME ?? 0).toBeGreaterThan(0);
    expect(res.ruleCounts.GAME_OVER ?? 0).toBeGreaterThan(0);
  });
});
