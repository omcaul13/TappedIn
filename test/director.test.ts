import { describe, expect, it } from 'vitest';
import { applyAction, createDirector, directorStep, type DirectorState, type DirectorStepConfig, type UserAction } from '../src/engine/director';
import type { GameView } from '../src/engine/ranker';
import type { Assessment, BreakState, Situation } from '../src/engine/types';
import { sec, snap, T0, testConfig, view, viewsOf } from './helpers';

const cfg = testConfig().director; // dwell 20s, auto-pick 120s, final linger 20s

const rz: Situation = { possessionTeamId: 'h', down: 1, distance: 10, yardsToEndzone: 8, downDistanceText: '1st & Goal at X 8', possessionText: 'X 8', isRedZone: true, redZoneSource: 'derived', homeTimeouts: 3, awayTimeouts: 3, lastPlay: null };

/** A tiny world of games whose states the test controls. */
function world(stepCfg: DirectorStepConfig = cfg) {
  const games = {
    h1: snap({ id: 'h1', shortName: 'HOME1' }),
    h2: snap({ id: 'h2', shortName: 'HOME2' }),
    c1: snap({ id: 'c1', shortName: 'CLOSE', home: { id: 'x', abbr: 'X', name: 'X', score: 7 }, away: { id: 'y', abbr: 'Y', name: 'Y', score: 7 } }),
    c2: snap({ id: 'c2', shortName: 'BLOWOUT', home: { id: 'x', abbr: 'X', name: 'X', score: 42 }, away: { id: 'y', abbr: 'Y', name: 'Y', score: 0 } }),
  };
  const channels: Record<string, number | null> = { h1: 849, h2: 850, c1: 805, c2: 806 };
  const states: Record<string, BreakState> = { h1: 'LIVE', h2: 'LIVE', c1: 'LIVE', c2: 'LIVE' };
  const since: Record<string, number> = {};
  const extra: Record<string, Partial<Assessment>> = {};
  let state: DirectorState = createDirector(4);
  const log: string[] = [];
  const views = (): Map<string, GameView> => viewsOf(...Object.values(games).map((g) => view(g, states[g.id], channels[g.id], { since: since[g.id] ?? T0 - sec(600), ...extra[g.id] })));
  return {
    games,
    set(id: keyof typeof games, st: BreakState, now: number, more: Partial<Assessment> = {}) {
      states[id] = st;
      since[id] = now;
      extra[id] = more;
    },
    act(a: UserAction, now: number) {
      const r = applyAction(state, a, views(), now);
      state = r.state;
      log.push(...r.decisions.map((d) => d.rule));
      return r;
    },
    step(now: number) {
      const r = directorStep(state, views(), now, stepCfg);
      state = r.state;
      log.push(...r.decisions.map((d) => d.rule));
      return r;
    },
    /** The game's network drops out of the lineup (a rescan or mapping edit mid-session). */
    dropChannel(id: keyof typeof games) {
      channels[id] = null;
    },
    screen(n: number) {
      return state.screens[n - 1];
    },
    showing(n: number) {
      const s = state.screens[n - 1].showing;
      return s.kind === 'game' ? s.gameId : s.kind;
    },
    log,
  };
}

describe('director', () => {
  it('setting a home game tunes the screen immediately', () => {
    const w = world();
    const r = w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    expect(r.commands).toEqual([{ type: 'tune', screen: 1, gameId: 'h1', channel: 849, channelName: 'ch849' }]);
    expect(w.screen(1).mode).toBe('HOME');
  });

  it('break → best live game; play resumes → back home; dwell respected both ways', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'BREAK', T0 + sec(5));
    expect(w.step(T0 + sec(5)).commands).toEqual([]); // 15s of dwell left
    expect(w.log.at(-1)).toBe('HOLD_DWELL');
    const r = w.step(T0 + sec(20));
    expect(r.commands[0]).toMatchObject({ type: 'tune', gameId: 'c1' }); // closest score
    expect(r.decisions[0]).toMatchObject({ rule: 'BREAK_FILL', switched: true, auto: true });
    expect(r.decisions[0].reasons.join(' ')).toMatch(/home HOME1 BREAK\?.*pick: CLOSE/);
    w.set('h1', 'LIVE', T0 + sec(30));
    expect(w.step(T0 + sec(30)).commands).toEqual([]); // fill-in only 10s ago
    const back = w.step(T0 + sec(40));
    expect(back.commands[0]).toMatchObject({ type: 'tune', gameId: 'h1' });
    expect(back.decisions[0].rule).toBe('RETURN_HOME');
  });

  it('two screens in a break at once get different games, oldest break first', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'setHome', screen: 2, gameId: 'h2' }, T0);
    w.set('h2', 'BREAK', T0 + sec(25));
    w.set('h1', 'BREAK', T0 + sec(28));
    w.step(T0 + sec(30));
    expect(w.showing(2)).toBe('c1'); // h2's break started first: it gets the best game
    expect(w.showing(1)).toBe('c2');
  });

  it("a fill-in never takes another screen's home game while something else is live", () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'setHome', screen: 2, gameId: 'c1' }, T0); // the closest game is screen 2's home
    w.set('h1', 'BREAK', T0 + sec(25));
    w.step(T0 + sec(25));
    expect(w.showing(1)).toBe('h2'); // next-closest (4 pts), not c1 (tied but taken)
  });

  it('duplicates only when nothing else is in play, and say so', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'setHome', screen: 2, gameId: 'h2' }, T0);
    w.set('c1', 'BREAK', T0);
    w.set('c2', 'FINAL', T0);
    w.set('h1', 'BREAK', T0 + sec(25));
    const r = w.step(T0 + sec(25));
    expect(w.showing(1)).toBe('h2');
    expect(r.decisions[0].duplicate).toBe(true);
  });

  it('with allowDuplicates off, stays on the home commercial instead of doubling a game', () => {
    const strict = { ...cfg, allowDuplicates: false };
    let state = createDirector(4);
    const g = { h1: snap({ id: 'h1' }), h2: snap({ id: 'h2' }) };
    const views = (h1: 'LIVE' | 'BREAK') => viewsOf(view(g.h1, h1, 849), view(g.h2, 'LIVE', 850));
    state = applyAction(state, { type: 'setHome', screen: 1, gameId: 'h1' }, views('LIVE'), T0).state;
    state = applyAction(state, { type: 'setHome', screen: 2, gameId: 'h2' }, views('LIVE'), T0).state;
    const r = directorStep(state, views('BREAK'), T0 + sec(25), strict);
    expect(r.commands).toEqual([]);
    expect(r.decisions[0].rule).toBe('NO_CANDIDATE');
  });

  it('stays home (logged once) when no other game is in play', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    for (const id of ['h2', 'c1', 'c2'] as const) w.set(id, 'BREAK', T0);
    w.set('h1', 'BREAK', T0 + sec(25));
    w.step(T0 + sec(25));
    w.step(T0 + sec(27));
    expect(w.showing(1)).toBe('h1');
    expect(w.log.filter((r) => r === 'NO_CANDIDATE')).toHaveLength(1);
  });

  it('fill-in goes to break → replaced; nothing left → home', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'BREAK', T0 + sec(20));
    w.step(T0 + sec(20));
    expect(w.showing(1)).toBe('c1');
    w.set('c1', 'BREAK', T0 + sec(45));
    expect(w.step(T0 + sec(45)).decisions[0].rule).toBe('FILL_REPLACE');
    expect(w.showing(1)).toBe('h2'); // 4-pt game beats the 42-pt blowout
    w.set('c2', 'BREAK', T0 + sec(70));
    w.set('h2', 'BREAK', T0 + sec(70));
    expect(w.step(T0 + sec(70)).decisions[0].rule).toBe('RETURN_HOME');
    expect(w.showing(1)).toBe('h1');
  });

  it('home game no longer in the lineup: stays put instead of crashing', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'BREAK', T0 + sec(20));
    w.step(T0 + sec(20));
    expect(w.showing(1)).toBe('c1');
    w.dropChannel('h1');
    for (const id of ['c1', 'c2', 'h2'] as const) w.set(id, 'BREAK', T0 + sec(70));
    expect(w.step(T0 + sec(70)).decisions[0].rule).toBe('NO_CANDIDATE');
    expect(w.showing(1)).toBe('c1');

    const h = world();
    h.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    h.set('h1', 'HALFTIME', T0 + sec(30));
    h.step(T0 + sec(30));
    h.dropChannel('h1');
    expect(h.step(T0 + sec(30 + cfg.halftimeMaxSeconds + 1)).decisions[0].rule).toBe('NO_CANDIDATE');
    expect(h.screen(1).mode).toBe('HALFTIME_REEL');
  });

  it('upgrades a fill-in to a red-zone game (after dwell)', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'BREAK', T0 + sec(20));
    w.step(T0 + sec(20));
    expect(w.showing(1)).toBe('c1');
    w.games.c2.situation = rz;
    expect(w.step(T0 + sec(30)).commands).toEqual([]);
    const r = w.step(T0 + sec(41));
    expect(r.decisions[0].rule).toBe('FILL_UPGRADE');
    expect(w.showing(1)).toBe('c2');
  });

  it('halftime → highlights; 2nd half → home', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'HALFTIME', T0 + sec(30));
    const r = w.step(T0 + sec(30));
    expect(r.commands).toEqual([{ type: 'showHalftime', screen: 1, homeGameId: 'h1' }]);
    expect(w.screen(1).mode).toBe('HALFTIME_REEL');
    w.set('h1', 'BREAK', T0 + sec(1200)); // 2nd-half kickoff break: keep the reel
    expect(w.step(T0 + sec(1200)).commands).toEqual([]);
    w.set('h1', 'LIVE', T0 + sec(1260));
    const back = w.step(T0 + sec(1260));
    expect(back.decisions[0].rule).toBe('HALFTIME_OVER');
    expect(w.showing(1)).toBe('h1');
  });

  it('a halftime longer than halftimeMaxSeconds: back to the game, and the reel does not start again', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'HALFTIME', T0 + sec(30));
    w.step(T0 + sec(30));
    expect(w.showing(1)).toBe('halftime');
    const over = T0 + sec(30 + cfg.halftimeMaxSeconds + 1);
    expect(w.step(over).decisions[0].rule).toBe('HALFTIME_OVER');
    expect(w.showing(1)).toBe('h1');
    expect(w.step(over + sec(60)).commands).toEqual([]); // still halftime on ESPN, past the dwell
    expect(w.showing(1)).toBe('h1');
  });

  it('game over → pop-up after the linger → auto-pick after 120s becomes the new home', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'FINAL', T0 + sec(100));
    expect(w.step(T0 + sec(110)).commands).toEqual([]); // lingering on the final play
    const pop = w.step(T0 + sec(120));
    expect(pop.commands).toEqual([{ type: 'showGameOver', screen: 1, gameId: 'h1', autoPickAt: T0 + sec(240) }]);
    expect(w.step(T0 + sec(200)).commands).toEqual([]);
    const pick = w.step(T0 + sec(240));
    expect(pick.decisions[0].rule).toBe('AUTO_PICK');
    expect(pick.commands).toEqual([{ type: 'hideGameOver', screen: 1 }, expect.objectContaining({ type: 'tune', gameId: 'c1' })]);
    expect(w.screen(1).homeGameId).toBe('c1');
  });

  it('picking from the pop-up sets the new home right away', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'FINAL', T0);
    w.step(T0 + sec(30));
    const r = w.act({ type: 'setHome', screen: 1, gameId: 'c2' }, T0 + sec(35));
    expect(r.commands).toEqual([{ type: 'hideGameOver', screen: 1 }, expect.objectContaining({ type: 'tune', gameId: 'c2' })]);
    expect(w.screen(1).mode).toBe('HOME');
  });

  it('lock stops automatic switching; force locks on a game; home sends it back', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'lock', screen: 1 }, T0 + sec(1));
    w.set('h1', 'BREAK', T0 + sec(30));
    expect(w.step(T0 + sec(30)).commands).toEqual([]);
    w.act({ type: 'force', screen: 1, gameId: 'c2' }, T0 + sec(31)); // manual commands ignore dwell
    expect(w.showing(1)).toBe('c2');
    expect(w.screen(1).mode).toBe('LOCKED');
    w.set('c2', 'BREAK', T0 + sec(60));
    expect(w.step(T0 + sec(60)).commands).toEqual([]);
    w.act({ type: 'goHome', screen: 1 }, T0 + sec(61));
    expect(w.showing(1)).toBe('h1');
    expect(w.screen(1).mode).toBe('HOME');
  });

  it('skip jumps to the best other game now (ignoring dwell) and locks there', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    const r = w.act({ type: 'skip', screen: 1 }, T0 + sec(2));
    expect(r.decisions[0].rule).toBe('USER_SKIP');
    expect(w.showing(1)).toBe('c1');
    expect(w.screen(1).mode).toBe('LOCKED');
    w.act({ type: 'goHome', screen: 1 }, T0 + sec(3));
    expect(w.showing(1)).toBe('h1');
  });

  it('"Not now" on the game-over pop-up stops the auto-pick', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'FINAL', T0);
    w.step(T0 + sec(30));
    expect(w.screen(1).gameOver?.autoPickAt).toBe(T0 + sec(150));
    const r = w.act({ type: 'cancelAutoPick', screen: 1 }, T0 + sec(40));
    expect(r.decisions[0].rule).toBe('USER_KEEP');
    expect(w.screen(1).gameOver?.autoPickAt).toBeNull();
    expect(w.step(T0 + sec(400)).commands).toEqual([]);
    expect(w.showing(1)).toBe('h1');
  });

  it('refuses games that are not in the lineup', () => {
    const w = world();
    const r = applyAction(createDirector(4), { type: 'setHome', screen: 1, gameId: 'plus' }, viewsOf(view(snap({ id: 'plus', networks: ['ESPN+'] }), 'LIVE', null)), T0);
    expect(r.decisions[0].rule).toBe('USER_REJECTED');
    expect(r.commands).toEqual([]);
    expect(w.log).toEqual([]);
  });

  describe('switch-less settings (Low)', () => {
    const low: DirectorStepConfig = { ...cfg, upgradeFillInToRedZone: false, minSubstituteSeconds: 30, replaceIfHomeRemainingSeconds: 120, candidateMaxBreakRisk: 0.5 };
    const fc = (remainingSec: number | null, confidence = 0.9): Partial<Assessment> => ({ forecast: { category: 'endOfQuarter', label: 'End of quarter', confidence, remainingSec, quietSec: 10 } });

    it('stays on the substitute at least 30 s even if home resumes sooner', () => {
      const w = world(low);
      w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
      w.set('h1', 'BREAK', T0 + sec(20), fc(200));
      w.step(T0 + sec(20));
      expect(w.showing(1)).toBe('c1');
      w.set('h1', 'LIVE', T0 + sec(42));
      expect(w.step(T0 + sec(42)).commands).toEqual([]); // dwell (20 s) is over, but not 30 s yet
      expect(w.log.at(-1)).toBe('HOLD_DWELL');
      expect(w.step(T0 + sec(50)).decisions[0].rule).toBe('RETURN_HOME');
    });

    it('a substitute that goes to break: wait it out when home is nearly back', () => {
      const w = world(low);
      w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
      w.set('h1', 'BREAK', T0 + sec(20), fc(200));
      w.step(T0 + sec(20));
      w.set('h1', 'BREAK', T0 + sec(20), fc(40));
      w.set('c1', 'BREAK', T0 + sec(60));
      const r = w.step(T0 + sec(60));
      expect(r.commands).toEqual([]);
      expect(r.decisions[0].reasons[0]).toMatch(/has only ~40s of break left; staying until it resumes/);
      expect(w.showing(1)).toBe('c1');
    });

    it('…but swap it for a third game when home still has a long break', () => {
      const w = world(low);
      w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
      w.set('h1', 'BREAK', T0 + sec(20), fc(200));
      w.step(T0 + sec(20));
      w.set('h1', 'BREAK', T0 + sec(20), fc(150));
      w.set('c1', 'BREAK', T0 + sec(60));
      expect(w.step(T0 + sec(60)).decisions[0].rule).toBe('FILL_REPLACE');
      expect(w.showing(1)).toBe('h2');
    });

    it('skips a substitute that is probably in a stoppage of its own', () => {
      const w = world(low);
      w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
      w.set('c1', 'LIVE', T0, fc(80, 0.6)); // closest game, but 60% likely in a long stoppage
      w.set('h1', 'BREAK', T0 + sec(20), fc(200));
      w.step(T0 + sec(20));
      expect(w.showing(1)).toBe('h2');
    });

    it('no red-zone upgrades on Low', () => {
      const w = world(low);
      w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
      w.set('h1', 'BREAK', T0 + sec(20), fc(200));
      w.step(T0 + sec(20));
      w.games.c2.situation = rz;
      expect(w.step(T0 + sec(60)).commands).toEqual([]);
      expect(w.showing(1)).toBe('c1');
    });
  });

  it('stream errors park the screen until it recovers', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'streamError', screen: 1, detail: 'STREAM_LIMIT: maximum number of devices' }, T0 + sec(5));
    w.set('h1', 'BREAK', T0 + sec(30));
    expect(w.step(T0 + sec(30)).commands).toEqual([]);
    w.act({ type: 'streamOk', screen: 1 }, T0 + sec(40));
    expect(w.screen(1).mode).toBe('HOME');
  });

  it('a stream problem on a locked screen keeps it locked after it recovers', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.act({ type: 'lock', screen: 1 }, T0 + sec(1));
    w.act({ type: 'streamError', screen: 1, detail: 'STALLED: no new frames' }, T0 + sec(5));
    w.act({ type: 'streamError', screen: 1, detail: 'STALLED: still no frames' }, T0 + sec(7));
    w.act({ type: 'streamOk', screen: 1 }, T0 + sec(10));
    expect(w.screen(1).mode).toBe('LOCKED');
    w.set('h1', 'BREAK', T0 + sec(60));
    expect(w.step(T0 + sec(60)).commands).toEqual([]);
  });

  it('a stream problem during the game-over pop-up keeps "Not now"', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'FINAL', T0);
    w.step(T0 + sec(30));
    w.act({ type: 'cancelAutoPick', screen: 1 }, T0 + sec(40));
    w.act({ type: 'streamError', screen: 1, detail: 'STALLED: no new frames' }, T0 + sec(50));
    w.act({ type: 'streamOk', screen: 1 }, T0 + sec(60));
    expect(w.screen(1).mode).toBe('GAME_OVER');
    expect(w.step(T0 + sec(400)).commands).toEqual([]);
  });
});

describe('director: missing data after the final', () => {
  it('a game-over pop-up stays up when the finished game goes stale (UNKNOWN), and a halftime reel keeps playing', () => {
    const w = world();
    w.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w.set('h1', 'FINAL', T0 + sec(30));
    w.step(T0 + sec(60)); // pop-up after the linger
    expect(w.screen(1).mode).toBe('GAME_OVER');
    w.set('h1', 'UNKNOWN', T0 + sec(90)); // ESPN went quiet for a minute
    const r = w.step(T0 + sec(95));
    expect(w.screen(1).mode).toBe('GAME_OVER');
    expect(r.commands).toEqual([]);

    const w2 = world();
    w2.act({ type: 'setHome', screen: 1, gameId: 'h1' }, T0);
    w2.set('h1', 'HALFTIME', T0 + sec(30));
    w2.step(T0 + sec(60));
    expect(w2.showing(1)).toBe('halftime');
    w2.set('h1', 'UNKNOWN', T0 + sec(90));
    w2.step(T0 + sec(95));
    expect(w2.showing(1)).toBe('halftime');
  });
});
