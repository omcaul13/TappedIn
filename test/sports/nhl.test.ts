import { describe, expect, it } from 'vitest';
import { nhl } from '../../src/sports/hockey';
import { snap } from '../helpers';
import { breakStarts, fixtureGames } from './harness';

// NHL break detector and excitement on three recorded games from 10/13/2026 (Low sensitivity).

const games = fixtureGames('nhl');
const stateAt = (states: { at: number; state: string }[], t: number) => states.filter((x) => x.at <= t).at(-1)?.state;
const stop = (text: string) => ({ kind: nhl.classifyPlay('Stoppage', false, 0), typeText: 'Stoppage', text, period: 2 });

describe('NHL stoppages', () => {
  it('reads the reason of each whistle', () => {
    expect(nhl.breaks.categorize(stop('TV Timeout'))).toBe('tvTimeout');
    expect(nhl.breaks.categorize(stop('Icing'))).toBe('whistle');
    expect(nhl.breaks.categorize(stop('Timeout - Home'))).toBe('teamTimeout');
    expect(nhl.breaks.categorize({ kind: nhl.classifyPlay('Tripping', false, 0), typeText: 'Tripping', text: 'Tripping against X', period: 1 })).toBe('penalty');
    expect(nhl.classifyPlay('Face Off', false, 0)).toBe('snap');
    expect(nhl.classifyPlay('Goal', true, 1)).toBe('score');
  });
  it('the 1st and 2nd intermissions are halftime (the reel); the end of regulation is a break', () => {
    expect(nhl.phaseOf('STATUS_END_PERIOD', 'in', 'End of 1st', 1)).toBe('HALFTIME');
    expect(nhl.phaseOf('STATUS_IN_PROGRESS', 'in', '2nd Intermission', 2)).toBe('HALFTIME');
    expect(nhl.phaseOf('STATUS_END_PERIOD', 'in', 'End of 3rd', 3)).toBe('LIVE');
    expect(nhl.breaks.categorize({ kind: 'endPeriod', typeText: 'Period End', text: '', period: 3 })).toBe('endOfPeriod');
    expect(nhl.breaks.categorize({ kind: 'endPeriod', typeText: 'Period End', text: '', period: 1 })).toBeNull();
  });
});

describe('NHL break detector on recorded games (Low)', () => {
  it('has fixtures', () => expect(games.length).toBeGreaterThanOrEqual(3));
  for (const g of games) {
    const { starts, states } = breakStarts('nhl', g.body);
    it(`${g.id}: every TV timeout is a break once the viewer sees it`, () => {
      const tvs = g.plays.filter((p) => p.typeText === 'Stoppage' && /tv timeout/i.test(p.text));
      expect(tvs.length).toBeGreaterThanOrEqual(1); // ESPN logs some games' TV timeouts, not always all
      for (const p of tvs) expect(stateAt(states, p.wallclock! + 30_000 + 20_000), new Date(p.wallclock!).toISOString()).toBe('BREAK');
    });
    it(`${g.id}: icings, offsides and goalie freezes don't switch on their own`, () => {
      for (const s of starts.filter((x) => x.category === 'whistle' || x.category === 'ordinary')) expect(s.quietSec, s.reasons[0]).toBeGreaterThanOrEqual(45);
    });
    it(`${g.id}: both intermissions show the reel`, () => {
      const half = states.filter((x) => x.state === 'HALFTIME');
      expect(half.length).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('NHL excitement', () => {
  const g = (o: Parameters<typeof snap>[0]) => snap({ sport: 'nhl', home: { id: 'h', abbr: 'BOS', name: 'Bruins', score: 2 }, away: { id: 'a', abbr: 'TOR', name: 'Leafs', score: 1 }, ...o });
  it('power play, a one-goal game in the last minutes, and overtime are hot', () => {
    expect(nhl.excitement(g({ period: 2, clockSec: 600, live: { family: 'hockey', lastPlay: null, strength: 'pp', advantageTeamId: 'h' } })).hot?.label).toBe('BOS power play');
    expect(nhl.excitement(g({ period: 3, clockSec: 90 })).hot?.label).toMatch(/one-goal/);
    expect(nhl.excitement(g({ period: 4, clockSec: 200, home: { id: 'h', abbr: 'BOS', name: 'B', score: 2 }, away: { id: 'a', abbr: 'TOR', name: 'L', score: 2 } })).hot?.label).toBe('overtime');
    expect(nhl.excitement(g({ period: 1, clockSec: 900 })).hot).toBeNull();
  });
  it('the power play comes from the latest play strength', () => {
    const live = nhl.liveFromPlays!([{ id: '1', seq: 1, typeText: 'Shot', text: '', kind: 'snap', period: 2, displayClock: '5:00', wallclock: 1, scoringPlay: false, scoreValue: 0, awayScore: 1, homeScore: 2, isTurnover: false, teamId: 'a', endYardsToEndzone: null, endTeamId: null, strength: 'Shorthanded' }], g({}));
    expect(live).toMatchObject({ strength: 'pp', advantageTeamId: 'h' });
  });
});
