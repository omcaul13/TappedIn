import { describe, expect, it } from 'vitest';
import { applyAction, createDirector, directorStep, type DirectorState } from '../src/engine/director';
import type { GameView } from '../src/engine/ranker';
import type { BreakState } from '../src/engine/types';
import { sec, snap, T0, testConfig, view, viewsOf } from './helpers';

// The three fill-in tiers (README "Switching rules"): when a screen's game goes to a long break, the
// replacement is
//   1. another live game of the same sport (that sport's own order), else
//   2. a live game of a sport another screen is watching (normalized excitement), else
//   3. any other live game (normalized excitement), else
//   4. stay on the home game.
// Dwell, locks and "no game on two screens" still apply.

const cfg = testConfig().director;
const score = (h: number, a: number) => ({ home: { id: 'h', abbr: 'H', name: 'H', score: h }, away: { id: 'a', abbr: 'A', name: 'A', score: a } });

function world(stepCfg: typeof cfg = cfg) {
  const games = {
    nhlHome: snap({ id: 'nhlHome', sport: 'nhl', period: 2, clockSec: 600, ...score(1, 1) }),
    cfbHome: snap({ id: 'cfbHome', sport: 'cfb', ...score(14, 10) }),
    nhlOther: snap({ id: 'nhlOther', sport: 'nhl', period: 1, clockSec: 1000, ...score(4, 0) }), // dull: same sport
    cfbOther: snap({ id: 'cfbOther', sport: 'cfb', period: 3, clockSec: 400, ...score(20, 17) }), // S2's sport
    nbaClutch: snap({ id: 'nbaClutch', sport: 'nba', period: 4, clockSec: 90, ...score(101, 100) }), // hottest, other sport
  };
  const channels: Record<string, number> = { nhlHome: 822, cfbHome: 849, nhlOther: 851, cfbOther: 805, nbaClutch: 913 };
  const states: Record<string, BreakState> = { nhlHome: 'LIVE', cfbHome: 'LIVE', nhlOther: 'LIVE', cfbOther: 'LIVE', nbaClutch: 'LIVE' };
  let state: DirectorState = createDirector(2);
  const views = (): Map<string, GameView> => viewsOf(...Object.values(games).map((g) => view(g, states[g.id], channels[g.id])));
  const set = (id: keyof typeof games, st: BreakState) => (states[id] = st);
  const act = (a: Parameters<typeof applyAction>[1], now: number) => (state = applyAction(state, a, views(), now).state);
  const step = (now: number) => {
    const r = directorStep(state, views(), now, stepCfg);
    state = r.state;
    return r;
  };
  const showing = (n: number) => {
    const s = state.screens[n - 1].showing;
    return s.kind === 'game' ? s.gameId : s.kind;
  };
  act({ type: 'setHome', screen: 1, gameId: 'nhlHome' }, T0);
  act({ type: 'setHome', screen: 2, gameId: 'cfbHome' }, T0);
  return { set, act, step, showing };
}

const later = T0 + sec(60);
const tierOf = (r: ReturnType<ReturnType<typeof world>['step']>) => r.decisions.find((d) => d.rule === 'BREAK_FILL');

describe('3-tier fill-in order', () => {
  it('1. same sport first, even when another sport is more exciting', () => {
    const w = world();
    w.set('nhlHome', 'BREAK');
    const d = tierOf(w.step(later))!;
    expect(w.showing(1)).toBe('nhlOther');
    expect(d.tier).toBe(1);
    expect(d.reasons.join(' | ')).toMatch(/Same sport: /);
  });

  it("2. then a sport another screen is watching (S2's college football) over a hotter third sport", () => {
    const w = world();
    w.set('nhlOther', 'BREAK');
    w.set('nhlHome', 'BREAK');
    const d = tierOf(w.step(later))!;
    expect(w.showing(1)).toBe('cfbOther');
    expect(d.tier).toBe(2);
    expect(d.reasons.join(' | ')).toMatch(/Other screen's sport \(CFB\): /);
  });

  it('3. then any other sport, by normalized excitement', () => {
    const w = world();
    w.set('nhlOther', 'BREAK');
    w.set('cfbOther', 'BREAK');
    w.set('nhlHome', 'BREAK');
    const d = tierOf(w.step(later))!;
    expect(w.showing(1)).toBe('nbaClutch');
    expect(d.tier).toBe(3);
    expect(d.reasons.join(' | ')).toMatch(/Other sport \(NBA\): clutch time/);
  });

  it('4. nothing else in play: stay on the home game', () => {
    const w = world({ ...cfg, allowDuplicates: false });
    for (const id of ['nhlOther', 'cfbOther', 'nbaClutch'] as const) w.set(id, 'BREAK');
    w.set('nhlHome', 'BREAK');
    const d = w.step(later).decisions;
    expect(w.showing(1)).toBe('nhlHome');
    expect(d.some((x) => x.rule === 'NO_CANDIDATE')).toBe(true);
  });

  it("with director.allowDuplicates on: another screen's game only as the flagged last resort", () => {
    const w = world({ ...cfg, allowDuplicates: true });
    for (const id of ['nhlOther', 'cfbOther', 'nbaClutch'] as const) w.set(id, 'BREAK');
    w.set('nhlHome', 'BREAK');
    const d = tierOf(w.step(later))!;
    expect(w.showing(1)).toBe('cfbHome');
    expect(d.duplicate).toBe(true);
  });

  it('respects dwell and locks', () => {
    const w = world();
    w.set('nhlHome', 'BREAK');
    w.step(T0 + sec(5)); // 5 s after the home was set: dwell holds
    expect(w.showing(1)).toBe('nhlHome');
    w.act({ type: 'lock', screen: 1 }, T0 + sec(6));
    w.step(later);
    expect(w.showing(1)).toBe('nhlHome');
    w.act({ type: 'unlock', screen: 1 }, later);
    w.step(later + sec(30));
    expect(w.showing(1)).toBe('nhlOther');
  });

  it('goes back home when the home game resumes', () => {
    const w = world();
    w.set('nhlHome', 'BREAK');
    w.step(later);
    expect(w.showing(1)).toBe('nhlOther');
    w.set('nhlHome', 'LIVE');
    w.step(later + sec(60));
    expect(w.showing(1)).toBe('nhlHome');
  });
});

describe('game over prefers the same sport', () => {
  it('auto-picks a same-sport game over a more exciting other sport', () => {
    const w = world();
    w.set('nhlHome', 'FINAL');
    w.step(later); // linger
    w.step(later + sec(30)); // pop-up
    w.step(later + sec(30) + sec(cfg.gameOverAutoPickSeconds + 1));
    expect(w.showing(1)).toBe('nhlOther');
  });
});
