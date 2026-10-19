import { cfb } from '../src/sports/cfb';
import { describe, expect, it } from 'vitest';
import { directorSettings } from '../src/config';
import { addGap, categorize, emptyModel, forecastBreak, loadBreakModel, survival, type BreakModel } from '../src/engine/forecast';
import { assessForecast, type ForecastDetectorOptions } from '../src/engine/forecastDetector';
import type { DetectorMemory } from '../src/engine/breakDetector';
import { GameStore } from '../src/engine/gameStore';
import type { GameSnapshot, PlaySnap } from '../src/engine/types';
import { play, sec, snap, T0, testConfig } from './helpers';

// Stream delay 30 s, data delay 25 s: a play at T0 reaches us at T0+25 and the viewer at T0+30.
const timing = { dataDelaySeconds: 25, streamDelaySeconds: 30 };

/** Hand-made model: every end of quarter lasts 200 s, scores 150 s, ordinary plays 20 s, timeouts half 30 s / half 150 s. */
function fixtureModel(): BreakModel {
  const m = emptyModel(5);
  for (let i = 0; i < 20; i++) {
    addGap(m, 'endOfQuarter', 200);
    addGap(m, 'scorePAT', 150);
    addGap(m, 'kickoffAfterScore', 150);
    addGap(m, 'ordinary', 20);
    addGap(m, 'teamTimeout', i < 10 ? 30 : 150);
  }
  return m;
}

describe('forecast math', () => {
  const m = fixtureModel();

  it('survival is the share of stoppages at least that long, linear within a 5 s bin', () => {
    expect(survival(m, 'teamTimeout', 0)).toBe(1);
    expect(survival(m, 'teamTimeout', 30)).toBe(1);
    expect(survival(m, 'teamTimeout', 32.5)).toBe(0.75);
    expect(survival(m, 'teamTimeout', 35)).toBe(0.5);
    expect(survival(m, 'teamTimeout', 155)).toBe(0);
    expect(survival(m, 'injury', 10)).toBe(0); // no data
  });

  it('when the viewer has just seen a timeout, it is a coin flip whether 60 s more follow', () => {
    const f = forecastBreak(m, 'teamTimeout', T0, T0 + sec(30), timing, 60);
    expect(f.quietSec).toBe(5);
    expect(f.viewerElapsedSec).toBe(0);
    expect(f.confidence).toBe(0.5);
  });

  it('once the quiet outlasts the short timeouts, a long break is certain and the time left is known', () => {
    const f = forecastBreak(m, 'teamTimeout', T0, T0 + sec(65), timing, 60);
    expect(f.quietSec).toBe(40);
    expect(f.confidence).toBe(1);
    expect(f.remainingSec).toBe(153 - 35); // long timeouts last 150-155 s (median 153), viewer is 35 s in
  });

  it('quiet counts only up to the last poll that could have shown a new play', () => {
    const fresh = forecastBreak(m, 'teamTimeout', T0, T0 + sec(65), timing, 60, T0 + sec(65));
    const stale = forecastBreak(m, 'teamTimeout', T0, T0 + sec(65), timing, 60, T0 + sec(50));
    expect(fresh.quietSec).toBe(40);
    expect(stale.quietSec).toBe(25);
    expect(stale.confidence).toBe(0.5);
  });

  it('quieter than anything on record: still a break, length unknown', () => {
    const f = forecastBreak(m, 'ordinary', T0, T0 + sec(200), timing, 60);
    expect(f.confidence).toBe(0.9);
    expect(f.remainingSec).toBeNull();
  });
});

describe('stoppage categories', () => {
  const p = (kind: PlaySnap['kind'], typeText: string, text = '', o: { period?: number; isTurnover?: boolean } = {}) => ({ kind, typeText, text, period: o.period ?? 2, isTurnover: o.isTurnover ?? false });

  it('maps plays to the stoppage that follows them', () => {
    expect(categorize(p('timeout', 'Timeout'))).toBe('teamTimeout');
    expect(categorize(p('admin', 'Two-Minute Warning'))).toBe('teamTimeout');
    expect(categorize(p('endPeriod', 'End Period', '', { period: 1 }))).toBe('endOfQuarter');
    expect(categorize(p('endPeriod', 'End Period', '', { period: 2 }))).toBeNull(); // halftime has its own state
    expect(categorize(p('kickoff', 'Kickoff'), { kind: 'pat' })).toBe('kickoffAfterScore');
    expect(categorize(p('kickoff', 'Kickoff'), { kind: 'snap' })).toBe('ordinary');
    expect(categorize(p('snap', 'Rush', 'Smith run for 3 yds, Jones injured on the play'))).toBe('injury');
    expect(categorize(p('snap', 'Pass Reception', 'After review, the ruling on the field is overturned'))).toBe('review');
    expect(categorize(p('snap', 'Punt'))).toBe('changeOfPossession');
    expect(categorize(p('snap', 'Pass Interception Return', '', { isTurnover: true }))).toBe('changeOfPossession');
    expect(categorize(p('score', 'Passing Touchdown'))).toBe('scorePAT');
  });

  it('incompletions, out of bounds, first downs and penalties are ordinary', () => {
    expect(categorize(p('snap', 'Pass Incompletion', 'Smith pass incomplete to Jones'))).toBe('ordinary');
    expect(categorize(p('snap', 'Rush', 'Smith run for 12 yds to the X 40 for a 1ST down, out of bounds'))).toBe('ordinary');
    expect(categorize(p('snap', 'Penalty', 'FALSE START on X, 5 yards'))).toBe('ordinary');
  });
});

/** One game fed like the live app: each check is a poll that sees the plays ESPN has published by then. */
function harness(o: Partial<ForecastDetectorOptions> & { model: BreakModel }) {
  const opts: ForecastDetectorOptions = { staleDataSeconds: 60, ...timing, lingerSeconds: 5, minBreakSeconds: 60, confidence: 0.75, maxBreakSeconds: 600, breaks: cfb.breaks, ...o };
  const store = new GameStore({ dataDelaySeconds: timing.dataDelaySeconds });
  let base: GameSnapshot = snap({ id: 'x', situation: null });
  let mem: DetectorMemory | undefined;
  const plays: PlaySnap[] = [];
  store.ingestSnapshot(base, T0 - sec(120));
  return {
    /** A play happens at its wallclock; it shows up in polls dataDelay later. */
    add(...more: PlaySnap[]) {
      plays.push(...more);
    },
    board(o: Partial<GameSnapshot>) {
      base = { ...base, ...o };
    },
    at(now: number) {
      store.ingestSnapshot({ ...base, observedAt: now }, now);
      store.ingestPlays('x', plays.filter((p) => p.wallclock! + sec(timing.dataDelaySeconds) <= now), now);
      const r = assessForecast(store.get('x')!, mem, now, opts);
      mem = r.memory;
      return r.assessment;
    },
  };
}

describe('forecast detector: mechanics', () => {
  const model = fixtureModel();

  it('a break starts only once the viewer has seen the play', () => {
    const h = harness({ model });
    h.add(play('endPeriod', T0, { period: 1 }));
    expect(h.at(T0 + sec(29)).state).toBe('LIVE');
    const a = h.at(T0 + sec(31));
    expect(a.state).toBe('BREAK');
    expect(a.reasons[0]).toBe('End of quarter: ~3:22 left (100% chance of 60s+), quiet 6s'); // 203 s median, 1 s seen
    expect(a.forecast?.category).toBe('endOfQuarter');
  });

  it('hysteresis: clock and scoreboard changes or a timeout do not end a break; the next snap does', () => {
    const h = harness({ model });
    h.add(play('endPeriod', T0, { period: 1 }));
    expect(h.at(T0 + sec(31)).state).toBe('BREAK');
    h.board({ clockSec: 590, displayClock: '9:50', detail: '9:50 - 2nd' });
    expect(h.at(T0 + sec(60)).state).toBe('BREAK');
    h.add(play('timeout', T0 + sec(70)));
    expect(h.at(T0 + sec(100)).state).toBe('BREAK');
    h.add(play('snap', T0 + sec(200)));
    expect(h.at(T0 + sec(224)).state).toBe('BREAK');
    const back = h.at(T0 + sec(226));
    expect(back.state).toBe('LIVE');
    expect(back.reasons[0]).toMatch(/play resumed: Rush/);
  });

  it('touchdown → PAT → kickoff: the kickoff continues the break, the first snap ends it', () => {
    const h = harness({ model });
    h.add(play('score', T0));
    expect(h.at(T0 + sec(33)).state).toBe('LIVE'); // celebration still on screen (linger 5 s)
    expect(h.at(T0 + sec(36)).state).toBe('BREAK');
    h.add(play('pat', T0 + sec(40)));
    expect(h.at(T0 + sec(70)).state).toBe('BREAK');
    h.add(play('kickoff', T0 + sec(150)));
    const ko = h.at(T0 + sec(176));
    expect(ko.state).toBe('BREAK');
    expect(ko.reasons[0]).toMatch(/^Kickoff after a score/);
    h.add(play('snap', T0 + sec(300)));
    expect(h.at(T0 + sec(326)).state).toBe('LIVE');
  });

  it('data safety net: no new play for 10 minutes → back to LIVE, and the same play never re-triggers', () => {
    const h = harness({ model });
    h.add(play('endPeriod', T0, { period: 1 }));
    expect(h.at(T0 + sec(31)).state).toBe('BREAK');
    expect(h.at(T0 + sec(600)).state).toBe('BREAK');
    const a = h.at(T0 + sec(640));
    expect(a.state).toBe('LIVE');
    expect(a.reasons[0]).toMatch(/assuming play resumed/);
    expect(h.at(T0 + sec(650)).state).toBe('LIVE');
  });

  it('a long quiet after an ordinary play is not a break while it fits the short ones', () => {
    const h = harness({ model });
    h.add(play('snap', T0));
    for (const t of [31, 40, 45]) expect(h.at(T0 + sec(t)).state, `T0+${t}`).toBe('LIVE');
  });
});

describe('forecast detector: what each sensitivity switches for (shipped model from 76 recorded games)', () => {
  const cfg = testConfig();
  const model = loadBreakModel();
  const preset = (s: 'low' | 'medium' | 'high') => ({ model, minBreakSeconds: cfg.switching.presets[s].minBreakSeconds, confidence: cfg.switching.presets[s].confidence });

  it('Low: no switch for an incompletion, a run out of bounds or a penalty', () => {
    for (const [typeText, text] of [
      ['Pass Incompletion', 'Smith pass incomplete to Jones'],
      ['Rush', 'Smith run for 6 yds, out of bounds at the X 30'],
      ['Penalty', 'HOLDING on X, 10 yards'],
    ]) {
      const h = harness(preset('low'));
      h.add(play('snap', T0, { typeText, text }));
      for (const t of [31, 60, 90]) expect(h.at(T0 + sec(t)).state, `${typeText} at T0+${t}`).toBe('LIVE');
    }
  });

  it('Low: a team timeout alone is not enough; High switches right away', () => {
    const low = harness(preset('low'));
    low.add(play('timeout', T0));
    expect(low.at(T0 + sec(31)).state).toBe('LIVE');
    const high = harness(preset('high'));
    high.add(play('timeout', T0));
    expect(high.at(T0 + sec(31)).state).toBe('BREAK');
  });

  it('Low: the end of the 1st quarter and an injury stoppage switch as soon as you have seen them', () => {
    const q = harness(preset('low'));
    q.add(play('endPeriod', T0, { period: 1 }));
    expect(q.at(T0 + sec(31)).state).toBe('BREAK');
    const inj = harness(preset('low'));
    inj.add(play('snap', T0, { text: 'Smith run for 2 yds, Jones injured on the play' }));
    expect(inj.at(T0 + sec(31)).state).toBe('BREAK');
  });

  it('presets are ordered: higher sensitivity never needs more certainty or a longer break', () => {
    const p = cfg.switching.presets;
    expect(cfg.switching.sensitivity).toBe('low');
    expect(p.low.confidence).toBeGreaterThanOrEqual(p.medium.confidence);
    expect(p.medium.confidence).toBeGreaterThanOrEqual(p.high.confidence);
    expect(p.low.minBreakSeconds).toBeGreaterThanOrEqual(p.high.minBreakSeconds);
    expect(p.low.replaceIfHomeRemainingSeconds).toBeGreaterThan(p.high.replaceIfHomeRemainingSeconds);
    expect([p.low.upgradeToRedZone, p.medium.upgradeToRedZone, p.high.upgradeToRedZone]).toEqual([false, false, true]);
  });

  it('director settings: classic reproduces the old behaviour, forecast applies the preset', () => {
    const classic = directorSettings(testConfig({ switching: { breakModel: 'classic' } }));
    expect(classic).toMatchObject({ minSubstituteSeconds: 0, replaceIfHomeRemainingSeconds: 0, upgradeFillInToRedZone: true });
    expect(classic.candidateMaxBreakRisk).toBeUndefined();
    const low = directorSettings(cfg);
    expect(low).toMatchObject({ minSubstituteSeconds: 30, replaceIfHomeRemainingSeconds: 120, upgradeFillInToRedZone: false, candidateMaxBreakRisk: 0.5 });
  });
});
