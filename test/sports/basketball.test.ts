import { describe, expect, it } from 'vitest';
import type { SportId } from '../../src/engine/types';
import { sportOf } from '../../src/sports';
import { mcbb, nba, wcbb, wnba } from '../../src/sports/leagues';
import { snap } from '../helpers';
import { breakStarts, fixtureGames } from './harness';

// Basketball break detectors and excitement on recorded games (Feb–Mar and Aug 2026), Low sensitivity.

const stateAt = (states: { at: number; state: string }[], t: number) => states.filter((x) => x.at <= t).at(-1)?.state;

describe.each<[SportId, RegExp]>([
  ['mcbb', /OfficialTVTimeOut/],
  ['wcbb', /OfficialTVTimeOut/],
  ['nba', /^Full Timeout$/],
  ['wnba', /Official Timeout|Full Timeout/],
])('%s on recorded games', (sport, tvBreak) => {
  const games = fixtureGames(sport);
  it('has fixtures', () => expect(games.length).toBeGreaterThanOrEqual(2));
  for (const g of games) {
    const { starts, states } = breakStarts(sport, g.body);
    it(`${g.id}: a TV timeout (${tvBreak.source}) is a break once the viewer sees it`, () => {
      const tvs = g.plays.filter((p) => tvBreak.test(p.typeText));
      expect(tvs.length).toBeGreaterThan(2);
      let inBreak = 0;
      for (const p of tvs) if (stateAt(states, p.wallclock! + 30_000 + 20_000) === 'BREAK') inBreak++;
      // Nearly all: a timeout right before halftime or the final buzzer can't become a break.
      expect(inBreak / tvs.length).toBeGreaterThanOrEqual(0.8);
    });
    it(`${g.id}: fouls, free throws and baskets never start a break on their own (need 45 s+ of quiet)`, () => {
      for (const s of starts.filter((x) => x.category === 'foul' || x.category === 'made' || x.category === 'ordinary')) expect(s.quietSec, s.reasons[0]).toBeGreaterThanOrEqual(45);
    });
    it(`${g.id}: halftime is HALFTIME (the reel), not a break`, () => {
      expect(states.some((x) => x.state === 'HALFTIME')).toBe(true);
    });
  }
});

describe('basketball phases', () => {
  it('end of the first half (college) and of the 2nd quarter (pro, women\'s college) are halftime', () => {
    expect(mcbb.phaseOf('STATUS_IN_PROGRESS', 'in', 'End of 1st Half', 1)).toBe('HALFTIME');
    expect(nba.phaseOf('STATUS_END_PERIOD', 'in', 'End of 2nd Quarter', 2)).toBe('HALFTIME');
    expect(wcbb.phaseOf('STATUS_IN_PROGRESS', 'in', 'End of 2nd', 2)).toBe('HALFTIME');
    expect(nba.phaseOf('STATUS_END_PERIOD', 'in', 'End of 1st Quarter', 1)).toBe('LIVE');
    expect(nba.endOfPeriod('LIVE', 'STATUS_END_PERIOD', 'End of 1st Quarter')).toBe(true);
  });
  it('timeouts by kind', () => {
    const c = (typeText: string) => mcbb.breaks.categorize({ kind: mcbb.classifyPlay(typeText, false, 0), typeText, text: '', period: 1 });
    expect(c('OfficialTVTimeOut')).toBe('tvTimeout');
    expect(c('ShortTimeOut')).toBe('shortTimeout');
    expect(c('RegularTimeOut')).toBe('teamTimeout');
    expect(nba.breaks.categorize({ kind: 'timeout', typeText: 'Full Timeout', text: '', period: 3 })).toBe('teamTimeout');
    expect(wnba.breaks.categorize({ kind: 'timeout', typeText: 'Official Timeout', text: '', period: 3 })).toBe('tvTimeout');
    expect(c('Substitution')).toBeNull();
  });
});

describe('basketball excitement', () => {
  const g = (sport: SportId, period: number, clockSec: number, home: number, away: number) =>
    snap({ sport, period, clockSec, detail: `${Math.floor(clockSec / 60)}:00 - ${period}`, home: { id: 'h', abbr: 'H', name: 'H', score: home }, away: { id: 'a', abbr: 'A', name: 'A', score: away } });
  it('NBA clutch time: last 5:00 of the 4th within 5 points', () => {
    expect(nba.excitement(g('nba', 4, 240, 101, 99)).hot?.label).toBe('clutch time');
    expect(nba.excitement(g('nba', 4, 400, 101, 99)).hot).toBeNull();
    expect(nba.excitement(g('nba', 4, 240, 110, 99)).hot).toBeNull();
    expect(nba.excitement(g('nba', 5, 200, 110, 108)).hot?.label).toBe('overtime');
  });
  it("men's college crunch time: under 4:00 of the 2nd half within 6", () => {
    expect(mcbb.excitement(g('mcbb', 2, 200, 70, 65)).hot?.label).toBe('crunch time');
    expect(mcbb.excitement(g('mcbb', 1, 200, 30, 29)).hot).toBeNull();
  });
  it('normalized scores compare across leagues: a clutch NBA game outranks an early college game', () => {
    const clutch = nba.excitement(g('nba', 4, 120, 100, 99)).score;
    const early = mcbb.excitement(g('mcbb', 1, 1000, 10, 8)).score;
    expect(clutch).toBeGreaterThan(early);
    expect(clutch).toBeLessThanOrEqual(100);
  });
  it('game progress uses each clock', () => {
    expect(sportOf('nba').progressSeconds(g('nba', 4, 0, 0, 0))).toBe(48 * 60);
    expect(sportOf('mcbb').progressSeconds(g('mcbb', 2, 0, 0, 0))).toBe(40 * 60);
    expect(sportOf('wnba').progressSeconds(g('wnba', 5, 0, 0, 0))).toBe(45 * 60);
  });
});
