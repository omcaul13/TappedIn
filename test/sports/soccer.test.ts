import { describe, expect, it } from 'vitest';
import { epl, scoreFromGoalText, soccerSummaryPlays } from '../../src/sports/soccer';
import { snap } from '../helpers';
import { breakStarts, fixtureGames } from './harness';

// Soccer (MLS, Premier League, Champions League, La Liga): no commercials while the ball is in play,
// so a soccer screen switches only at halftime (the reel) and for weather delays; recorded games from
// 10/17 (Premier League) and 9/8 (Champions League).

describe('soccer phases and events', () => {
  it('halftime and the break before extra time are halftime; FT is final', () => {
    expect(epl.phaseOf('STATUS_HALFTIME', 'in', 'HT', 1)).toBe('HALFTIME');
    expect(epl.phaseOf('STATUS_END_OF_REGULATION', 'in', "90'", 2)).toBe('HALFTIME');
    expect(epl.phaseOf('STATUS_SECOND_HALF', 'in', "67'", 2)).toBe('LIVE');
    expect(epl.phaseOf('STATUS_FULL_TIME', 'post', 'FT', 2)).toBe('FINAL');
  });
  it('reads the score from goal text, home first', () => {
    expect(scoreFromGoalText('Goal! Everton 0, Chelsea 1. Pedro Neto (Chelsea) left footed shot.')).toEqual({ home: 0, away: 1 });
    expect(scoreFromGoalText('Own Goal by X, Brentford.  Brentford 2, Arsenal 2.')).toEqual({ home: 2, away: 2 });
  });
  it('nothing during play starts a break', () => {
    for (const t of ['Yellow Card', 'Substitution', 'Start Delay', 'Goal', 'Corner']) expect(epl.breaks.categorize({ kind: epl.classifyPlay(t, false, 0), typeText: t, text: '', period: 1 })).toBeNull();
  });
});

describe.each(['epl', 'ucl'] as const)('%s on recorded games', (sport) => {
  const games = fixtureGames(sport);
  it('has fixtures', () => expect(games.length).toBeGreaterThanOrEqual(2));
  for (const g of games) {
    const { starts, states } = breakStarts(sport, g.body);
    it(`${g.id}: never a break while the ball is in play, halftime shows the reel`, () => {
      expect(starts).toEqual([]);
      expect(states.some((x) => x.state === 'HALFTIME')).toBe(true);
      expect(states.at(-1)?.state).toBe('FINAL');
    });
    it(`${g.id}: the running score matches the final score`, () => {
      const plays = soccerSummaryPlays(g.body);
      const comp = (g.body as { header: { competitions: { competitors: { homeAway: string; score: string }[] }[] } }).header.competitions[0];
      const final = (side: string) => Number(comp.competitors.find((c) => c.homeAway === side)!.score);
      expect(plays.at(-1)!.homeScore).toBe(final('home'));
      expect(plays.at(-1)!.awayScore).toBe(final('away'));
    });
  }
});

describe('soccer excitement', () => {
  const g = (clockSec: number, displayClock: string, home: number, away: number, period = 2) => snap({ sport: 'epl', period, clockSec, displayClock, detail: displayClock, home: { id: 'h', abbr: 'H', name: 'H', score: home }, away: { id: 'a', abbr: 'A', name: 'A', score: away } });
  it('close late, stoppage time and extra time are hot', () => {
    expect(epl.excitement(g(80 * 60, "81'", 1, 1)).hot?.label).toBe('level late');
    expect(epl.excitement(g(80 * 60, "81'", 2, 1)).hot?.label).toBe('one-goal game late');
    expect(epl.excitement(g(92 * 60, "90'+2'", 2, 1)).hot?.label).toBe('stoppage time');
    expect(epl.excitement(g(100 * 60, "100'", 1, 1, 3)).hot?.label).toBe('extra time');
    expect(epl.excitement(g(30 * 60, "31'", 0, 0, 1)).hot).toBeNull();
    expect(epl.excitement(g(80 * 60, "81'", 3, 0)).hot).toBeNull();
  });
  it('a level game in stoppage time outranks an early one', () => {
    expect(epl.excitement(g(92 * 60, "90'+2'", 1, 1)).score).toBeGreaterThan(epl.excitement(g(10 * 60, "11'", 0, 0, 1)).score);
  });
});
