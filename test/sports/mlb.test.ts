import { describe, expect, it } from 'vitest';
import { mlb } from '../../src/sports/baseball';
import { snap } from '../helpers';
import { breakStarts, fixtureGames } from './harness';

// MLB break detector and excitement on two recorded games from 8/15/2026.

const games = fixtureGames('mlb');
const stateAt = (states: { at: number; state: string }[], t: number) => states.filter((x) => x.at <= t).at(-1)?.state;
const play = (typeText: string, text = '') => ({ kind: mlb.classifyPlay(typeText, false, 0), typeText, text, period: 5 });

describe('MLB stoppages', () => {
  it('half-innings, pitching changes, pitches and bookkeeping', () => {
    expect(mlb.breaks.categorize(play('End Inning', 'Middle of the 4th inning'))).toBe('halfInning');
    expect(mlb.breaks.categorize({ kind: 'timeout', typeText: 'Play Result', text: 'Armstrong relieved Herrin', period: 4 })).toBe('pitchingChange');
    expect(mlb.breaks.categorize(play('Ball', 'Pitch 1 : Ball 1'))).toBe('pitch');
    expect(mlb.breaks.categorize(play('Start Batter/Pitcher', 'Smith pitches to Jones'))).toBeNull();
    expect(mlb.breaks.ignore!({ kind: 'admin', typeText: 'Start Inning' })).toBe(true);
  });
  it('your call: half-innings switch at Medium and High only', () => {
    expect(mlb.presets.low.excludeCategories).toContain('halfInning');
    expect(mlb.presets.medium.excludeCategories).not.toContain('halfInning');
    expect(mlb.presets.high.excludeCategories).not.toContain('halfInning');
  });
  it('"Mid 4th" and "End 4th" are between halves', () => {
    expect(mlb.endOfPeriod('LIVE', 'STATUS_IN_PROGRESS', 'Mid 4th')).toBe(true);
    expect(mlb.endOfPeriod('LIVE', 'STATUS_IN_PROGRESS', 'Bot 4th')).toBe(false);
  });
});

describe('MLB break detector on recorded games', () => {
  it('has fixtures', () => expect(games.length).toBeGreaterThanOrEqual(2));
  for (const g of games) {
    const ends = g.plays.filter((p) => p.kind === 'endPeriod').slice(0, -1); // the last one ends the game
    it(`${g.id}: Low never switches between innings`, () => {
      const { starts } = breakStarts('mlb', g.body, 'low');
      expect(starts.filter((s) => s.category === 'halfInning')).toEqual([]);
    });
    it(`${g.id}: Medium is in a break 20 s after the viewer sees the third out`, () => {
      const { states } = breakStarts('mlb', g.body, 'medium');
      expect(ends.length).toBeGreaterThan(10);
      const inBreak = ends.filter((p) => stateAt(states, p.wallclock! + 30_000 + 20_000) === 'BREAK').length;
      expect(inBreak / ends.length).toBeGreaterThanOrEqual(0.9);
    });
    it(`${g.id}: pitches never start a break on their own`, () => {
      const { starts } = breakStarts('mlb', g.body, 'high');
      for (const s of starts.filter((x) => x.category === 'pitch')) expect(s.quietSec, s.reasons[0]).toBeGreaterThanOrEqual(45);
    });
  }
});

describe('MLB excitement', () => {
  const live = (o: Partial<{ half: 'top' | 'bottom'; outs: number; onFirst: boolean; onSecond: boolean; onThird: boolean; homeHits: number; awayHits: number }>) =>
    ({ family: 'baseball' as const, lastPlay: null, half: o.half ?? 'bottom', outs: o.outs ?? 1, balls: 0, strikes: 0, onFirst: o.onFirst ?? false, onSecond: o.onSecond ?? false, onThird: o.onThird ?? false, homeHits: o.homeHits ?? 5, awayHits: o.awayHits ?? 5 });
  const g = (inning: number, home: number, away: number, l: ReturnType<typeof live>) => snap({ sport: 'mlb', period: inning, detail: `Bot ${inning}th`, home: { id: 'h', abbr: 'BOS', name: 'Red Sox', score: home }, away: { id: 'a', abbr: 'NYY', name: 'Yankees', score: away }, live: l });
  it('runners in scoring position late in a close game, bases loaded, no-hitter, extras', () => {
    expect(mlb.excitement(g(8, 3, 2, live({ onSecond: true }))).hot?.label).toBe('runners in scoring position');
    expect(mlb.excitement(g(3, 3, 0, live({ onSecond: true }))).hot?.label).toBe(undefined);
    expect(mlb.excitement(g(5, 1, 1, live({ onFirst: true, onSecond: true, onThird: true }))).hot?.label).toBe('bases loaded');
    expect(mlb.excitement(g(7, 2, 0, live({ awayHits: 0 }))).hot?.label).toMatch(/BOS no-hitter/);
    expect(mlb.excitement(g(11, 4, 4, live({}))).hot?.label).toBe('extra innings');
  });
  it('a no-hitter in the 8th outranks an early blowout', () => {
    expect(mlb.excitement(g(8, 1, 0, live({ awayHits: 0 }))).score).toBeGreaterThan(mlb.excitement(g(2, 9, 0, live({}))).score);
  });
});
