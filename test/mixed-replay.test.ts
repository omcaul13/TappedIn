import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT, type Config } from '../src/config';
import { etTime, runSim } from '../src/sim';
import { computeMetrics, loadFinalPlays } from '../src/simMetrics';
import type { SportId } from '../src/engine/types';
import { FIXTURES, frozenConfig } from './helpers';

// A mixed-sport night: 10/17/2026's college football (4 games) and NHL (14 games), rebuilt from final
// play-by-play and run through the real engine with every game watchable. Checks the 3-tier order
// and every invariant, including #6 (a fill-in comes from the best tier that had a game).

const dir = path.join(FIXTURES, 'mixed-20261017');
const date = '20261017';

async function run(screenSports: SportId[], mut: (c: Config) => void = () => {}) {
  const cfg = frozenConfig();
  cfg.simulation.fullLineup = true;
  mut(cfg);
  const res = await runSim(cfg, { root: PROJECT_ROOT, date, dir, synth: true, screenSports, captureTimeline: true, fromMs: etTime(date, '13:05') });
  const fills = res.entries.flatMap((e) => (e.type === 'decision' && (e.rule === 'BREAK_FILL' || e.rule === 'FILL_REPLACE') ? [e] : []));
  return { res, fills, cfg };
}

describe('mixed-sport replay (CFB + NHL, 10/17 afternoon)', async () => {
  // 13:05: four college games and the first NHL game are on. One hockey screen and three college
  // screens (tiers 1 and 2), then four college screens, where hockey is a third sport (tier 3).
  const mixed = await run(['nhl', 'cfb', 'cfb', 'cfb']);
  const allCollege = await run(['cfb', 'cfb', 'cfb', 'cfb']);

  it('homes follow each screen\'s sport', () => {
    expect(mixed.res.homes.map((h) => h.sport)).toEqual(['nhl', 'cfb', 'cfb', 'cfb']);
    expect(allCollege.res.homes.map((h) => h.sport)).toEqual(['cfb', 'cfb', 'cfb', 'cfb']);
  });

  it('never breaks an invariant (no duplicates, dwell, fill-ins only in breaks, best tier first)', () => {
    expect(mixed.res.violations).toEqual([]);
    expect(allCollege.res.violations).toEqual([]);
  });

  it('fills from all three tiers, and same sport is by far the most common', () => {
    const tiers = [...mixed.fills, ...allCollege.fills].map((d) => d.tier);
    for (const t of [1, 2, 3]) expect(tiers.filter((x) => x === t).length, `tier ${t}`).toBeGreaterThan(0);
    expect(tiers.filter((x) => x === 1).length).toBeGreaterThan(tiers.length / 2);
  });

  it('every fill-in says its tier in its reasons', () => {
    for (const d of mixed.fills) expect(d.reasons.join(' | ')).toMatch(/— (Same sport|Other screen's sport \(\w+\)|Other sport \(\w+\)): /);
  });

  it('a tier-2 pick is a sport another screen was watching', () => {
    for (const d of mixed.fills.filter((x) => x.tier === 2)) expect(d.reasons.join(' | ')).toMatch(/Other screen's sport \((CFB|NHL)\)/);
  });

  it('per-sport report: home games keep most of the screen time, few false switches', () => {
    const finals = loadFinalPlays(dir);
    for (const sport of ['nhl', 'cfb'] as const) {
      const m = computeMetrics(sport, mixed.res, finals, mixed.cfg, 90, 45, sport);
      expect(m.homeShare, sport).toBeGreaterThan(0.6);
      if (m.shortFills !== null && m.fills >= 10) expect(m.shortFills / m.fills, sport).toBeLessThan(0.25);
    }
  });
});
