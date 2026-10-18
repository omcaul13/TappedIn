import { describe, expect, it } from 'vitest';
import { assess, type DetectorMemory } from '../src/engine/breakDetector';
import { GameStore } from '../src/engine/gameStore';
import type { GameSnapshot, PlaySnap } from '../src/engine/types';
import { play, sec, snap, T0, testConfig } from './helpers';

// Defaults: streamDelay 30s, dataDelay 25s, linger 5s, enter 0.6, exit 0.3, stale after 75s.

function harness(overrides: Record<string, unknown> = {}) {
  const cfg = testConfig(overrides);
  const store = new GameStore({ dataDelaySeconds: cfg.breakDetector.dataDelaySeconds });
  const det = { ...cfg.breakDetector, staleDataSeconds: cfg.espn.staleDataSeconds };
  let base: GameSnapshot = snap({ id: 'x', situation: null });
  let mem: DetectorMemory | undefined;
  let plays: PlaySnap[] = [];
  store.ingestSnapshot(base, T0 - sec(120));
  return {
    /** Update the scoreboard snapshot (merged into the previous one). */
    board(now: number, o: Partial<GameSnapshot> = {}) {
      base = { ...base, ...o, observedAt: now };
      store.ingestSnapshot(base, now);
    },
    /** Deliver more play-by-play (cumulative, like ESPN's summary). */
    pbp(now: number, ...more: PlaySnap[]) {
      plays = [...plays, ...more];
      store.ingestPlays('x', plays, now);
    },
    at(now: number) {
      store.ingestSnapshot({ ...base, observedAt: now }, now); // keep data fresh
      const r = assess(store.get('x')!, mem, now, det);
      mem = r.memory;
      return r.assessment;
    },
  };
}

describe('break detector', () => {
  it('a timeout becomes BREAK? only once the viewer could have seen it', () => {
    const h = harness();
    h.pbp(T0 + sec(1), play('snap', T0 - sec(40)));
    h.pbp(T0 + sec(20), play('timeout', T0, { text: 'Timeout Georgia, clock 01:18' }));
    expect(h.at(T0 + sec(20)).state).toBe('LIVE');
    const a = h.at(T0 + sec(31));
    expect(a.state).toBe('BREAK');
    expect(a.reasons[0]).toMatch(/timeout 0\.60: .*Timeout Georgia/);
  });

  it('the next snap ends the break right away (data time, not viewer time)', () => {
    const h = harness();
    h.pbp(T0, play('timeout', T0 - sec(40)));
    expect(h.at(T0).state).toBe('BREAK');
    h.pbp(T0 + sec(90), play('snap', T0 + sec(70)));
    const a = h.at(T0 + sec(90));
    expect(a.state).toBe('LIVE');
    expect(a.reasons[0]).toMatch(/play resumed: Rush/);
  });

  it('touchdown → PAT → commercial → kickoff: break holds until the kickoff', () => {
    const h = harness();
    h.pbp(T0 + sec(25), play('score', T0));
    expect(h.at(T0 + sec(32)).state).toBe('LIVE'); // linger: viewer is watching the celebration
    expect(h.at(T0 + sec(36)).state).toBe('BREAK');
    h.pbp(T0 + sec(60), play('pat', T0 + sec(40)));
    expect(h.at(T0 + sec(100)).state).toBe('BREAK');
    h.pbp(T0 + sec(200), play('kickoff', T0 + sec(180)));
    const a = h.at(T0 + sec(200));
    expect(a.state).toBe('LIVE');
    expect(a.reasons[0]).toMatch(/play resumed: Kickoff/);
    // After the kickoff only the weak kickoff-after-score signal (0.4) is active: stays LIVE.
    const later = h.at(T0 + sec(215));
    expect(later.state).toBe('LIVE');
    expect(later.signals.map((s) => s.name)).toContain('kickoffAfterScore');
  });

  it('a scoring play arriving in play-by-play does not end a break started by the scoreboard score change', () => {
    const h = harness();
    h.pbp(T0 - sec(60), play('snap', T0 - sec(90)));
    h.board(T0, { home: { id: 'hx', abbr: 'HX', name: 'Home', score: 20 } }); // +6 seen on the scoreboard first
    expect(h.at(T0 + sec(40)).state).toBe('BREAK');
    h.pbp(T0 + sec(45), play('score', T0 + sec(10))); // same TD, with a later wallclock
    expect(h.at(T0 + sec(46)).state).toBe('BREAK');
  });

  it('end of the 1st quarter is a break; end of the 2nd is left to the halftime status', () => {
    const q1 = harness();
    q1.pbp(T0, play('endPeriod', T0 - sec(40), { period: 1 }));
    expect(q1.at(T0).signals.map((s) => s.name)).toContain('endOfPeriod');
    expect(q1.at(T0).state).toBe('BREAK');
    const q2 = harness();
    q2.pbp(T0, play('endPeriod', T0 - sec(40), { period: 2 }));
    expect(q2.at(T0).signals.map((s) => s.name)).not.toContain('endOfPeriod');
  });

  it('a jump into the 2nd quarter between polls counts as the end-of-quarter break', () => {
    const h = harness();
    h.board(T0 - sec(12), { period: 1, clockSec: 20, detail: '0:20 - 1st' });
    h.board(T0, { period: 2, clockSec: 900, detail: '15:00 - 2nd' });
    const a = h.at(T0 + sec(6));
    expect(a.state).toBe('BREAK');
    expect(a.reasons[0]).toMatch(/endOfPeriod .*quarter break \(now 15:00 - 2nd\)/);
  });

  it('a game first seen at "15:00 - 4th" is in the quarter break', () => {
    const cfg = testConfig();
    const store = new GameStore({ dataDelaySeconds: 25 });
    store.ingestSnapshot(snap({ id: 'q', period: 4, clockSec: 900, detail: '15:00 - 4th' }), T0);
    store.ingestSnapshot(snap({ id: 'q', period: 4, clockSec: 900, detail: '15:00 - 4th' }), T0 + sec(6));
    const r = assess(store.get('q')!, undefined, T0 + sec(6), { ...cfg.breakDetector, staleDataSeconds: 60 });
    expect(r.assessment.state).toBe('BREAK');
  });

  it('no new plays for a while ramps up to a break', () => {
    const h = harness();
    h.pbp(T0, play('snap', T0));
    // quiet = now - 25s - T0; over 75s it adds 0.15 per 15s; 0.6 needs 4 steps → quiet > 120s.
    expect(h.at(T0 + sec(25 + 100)).state).toBe('LIVE');
    const a = h.at(T0 + sec(25 + 136));
    expect(a.state).toBe('BREAK');
    expect(a.reasons[0]).toMatch(/stale .*no new play for ~136s/);
  });

  it('gives up on a break after maxBreakSeconds and does not bounce straight back', () => {
    const h = harness();
    h.pbp(T0, play('snap', T0 - sec(200)));
    expect(h.at(T0).state).toBe('BREAK'); // long stale
    const a = h.at(T0 + sec(201));
    expect(a.state).toBe('LIVE');
    expect(a.reasons[0]).toMatch(/assuming play resumed/);
    expect(h.at(T0 + sec(215)).state).toBe('LIVE');
    h.pbp(T0 + sec(230), play('snap', T0 + sec(205)));
    expect(h.at(T0 + sec(230)).state).toBe('LIVE');
  });

  it('a review in the play text is a break signal; the next snap clears it', () => {
    const h = harness();
    h.pbp(T0, play('snap', T0 - sec(40), { text: 'Pass complete. The ruling on the field was overturned after review.' }));
    const a = h.at(T0);
    expect(a.signals.map((s) => s.name)).toContain('review');
    expect(a.state).toBe('BREAK');
    h.pbp(T0 + sec(60), play('snap', T0 + sec(30)));
    expect(h.at(T0 + sec(60)).state).toBe('LIVE');
  });

  it('scoreboard-only games: a timeout counter drop is enough', () => {
    const h = harness();
    const sit = { possessionTeamId: null, down: 1, distance: 10, yardsToEndzone: 60, downDistanceText: null, possessionText: null, isRedZone: false, redZoneSource: 'none' as const, homeTimeouts: 3, awayTimeouts: 2, lastPlay: null };
    h.board(T0 - sec(12), { situation: sit });
    h.board(T0, { situation: { ...sit, homeTimeouts: 2 } });
    // inferred time = seen - 25s; viewer sees it 30s after that
    expect(h.at(T0 + sec(4)).state).toBe('LIVE');
    expect(h.at(T0 + sec(6)).state).toBe('BREAK');
  });

  it('halftime and final wait for the stream (stream delay − data delay = 5s)', () => {
    const h = harness();
    h.board(T0, { phase: 'HALFTIME', detail: 'Halftime' });
    expect(h.at(T0 + sec(2)).state).toBe('LIVE');
    expect(h.at(T0 + sec(6)).state).toBe('HALFTIME');
    const f = harness();
    f.board(T0, { phase: 'FINAL', detail: 'Final' });
    expect(f.at(T0 + sec(2)).reasons[0]).toMatch(/still playing out/);
    expect(f.at(T0 + sec(6)).state).toBe('FINAL');
  });

  it('weather delay is a break; stale data is UNKNOWN; not started is PRE', () => {
    const d = harness();
    d.board(T0, { phase: 'DELAYED', detail: 'Delayed' });
    expect(d.at(T0).state).toBe('BREAK');
    const p = harness();
    p.board(T0, { phase: 'PRE', detail: '7:30 PM' });
    expect(p.at(T0).state).toBe('PRE');

    const cfg = testConfig();
    const store = new GameStore({ dataDelaySeconds: 25 });
    store.ingestSnapshot(snap({ id: 'y' }), T0);
    const r = assess(store.get('y')!, undefined, T0 + sec(61), { ...cfg.breakDetector, staleDataSeconds: 60 });
    expect(r.assessment.state).toBe('UNKNOWN');
  });

  it('thresholds come from config (hot-reloadable)', () => {
    const strict = harness({ breakDetector: { enterThreshold: 0.65 } });
    strict.pbp(T0, play('timeout', T0 - sec(40)));
    expect(strict.at(T0).state).toBe('LIVE'); // timeout alone is 0.6
    const loose = harness({ breakDetector: { signals: { timeout: { weight: 0.9 } } } });
    loose.pbp(T0, play('timeout', T0 - sec(40)));
    expect(loose.at(T0).score).toBe(0.9);
  });

  it('signals combine noisy-OR, one per kind', () => {
    const h = harness();
    h.pbp(T0, play('timeout', T0 - sec(45)), play('timeout', T0 - sec(40)), play('endPeriod', T0 - sec(35), { period: 3 }));
    const a = h.at(T0);
    expect(a.signals.map((s) => s.name).sort()).toEqual(['endOfPeriod', 'timeout']);
    expect(a.score).toBeCloseTo(1 - 0.4 * 0.2, 5);
  });
});
