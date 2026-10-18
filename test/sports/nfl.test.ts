import { describe, expect, it } from 'vitest';
import { nfl, regionalStatus } from '../../src/sports/nfl';
import { snap } from '../helpers';
import { breakStarts, fixtureGames, playBefore } from './harness';

// NFL break detector and excitement, on three recorded games from 10/11/2026 (Low sensitivity).

const games = fixtureGames('nfl');
const p = (kind: 'snap' | 'score' | 'kickoff' | 'timeout' | 'endPeriod' | 'admin', typeText: string, text = '') => ({ kind, typeText, text, period: 2 });

describe('NFL stoppage categories', () => {
  it('the two-minute warning is its own category, not a timeout', () => {
    expect(nfl.breaks.categorize(p('admin', 'Two-minute warning'))).toBe('twoMinuteWarning');
    expect(nfl.breaks.categorize(p('timeout', 'Timeout'))).toBe('teamTimeout');
  });
  it('incompletions and penalties are ordinary', () => {
    expect(nfl.breaks.categorize(p('snap', 'Pass Incompletion'))).toBe('ordinary');
    expect(nfl.breaks.categorize(p('snap', 'Penalty', 'FALSE START'))).toBe('ordinary');
  });
  it('a kickoff after a score does not continue the break (NFL takes the commercial after the score)', () => {
    expect(nfl.breaks.continues).toBeUndefined();
  });
});

describe('NFL break detector on recorded games (Low)', () => {
  it('has fixtures', () => expect(games.length).toBeGreaterThanOrEqual(3));

  for (const g of games) {
    const { starts, states } = breakStarts('nfl', g.body);

    it(`${g.id}: a minute after the viewer sees a two-minute warning, the game is in a break`, () => {
      const warnings = g.plays.filter((x) => /two[- ]minute/i.test(x.typeText));
      expect(warnings.length).toBeGreaterThan(0);
      for (const w of warnings) {
        const t = w.wallclock! + 30_000 + 60_000;
        const state = states.filter((x) => x.at <= t).at(-1)?.state;
        expect(state, `warning at ${new Date(w.wallclock!).toISOString()}`).toBe('BREAK');
      }
    });

    it(`${g.id}: ordinary plays (incompletions, penalties, out of bounds) only become a break after a minute of quiet`, () => {
      for (const s of starts.filter((x) => x.category === 'ordinary')) expect(s.quietSec, s.reasons[0]).toBeGreaterThanOrEqual(60);
    });

    it(`${g.id}: a break after a score ends with the kickoff`, () => {
      const scoreBreaks = starts.filter((s) => s.category === 'scorePAT');
      expect(scoreBreaks.length).toBeGreaterThan(0);
      for (const s of scoreBreaks) {
        const end = states.find((x) => x.at > s.at && x.state !== 'BREAK');
        if (!end) continue; // game ended in the break
        expect(end.a.reasons[0], playBefore(g.plays, s.at)?.text).toMatch(/play resumed: (Kickoff|.*kick)/i);
      }
    });

    it(`${g.id}: switches a reasonable number of times (one long break every few minutes)`, () => {
      expect(starts.length).toBeGreaterThan(12);
      expect(starts.length).toBeLessThan(45);
    });
  }
});

describe('NFL excitement', () => {
  const g = (o: Parameters<typeof snap>[0]) => snap({ sport: 'nfl', ...o });
  it('red zone and two-minute drill are hot moments', () => {
    const rz = g({ situation: { possessionTeamId: 'h', down: 1, distance: 10, yardsToEndzone: 12, downDistanceText: '1st & 10 at X 12', possessionText: 'X 12', isRedZone: true, redZoneSource: 'derived', homeTimeouts: 3, awayTimeouts: 3, lastPlay: null } });
    expect(nfl.excitement(rz).hot?.label).toBe('red zone');
    const drill = g({ period: 4, clockSec: 95, detail: '1:35 - 4th', home: { id: 'h', abbr: 'H', name: 'Home', score: 20 }, away: { id: 'a', abbr: 'A', name: 'Away', score: 17 } });
    expect(nfl.excitement(drill).hot?.label).toBe('two-minute drill');
    const blowout = g({ period: 4, clockSec: 95, home: { id: 'h', abbr: 'H', name: 'Home', score: 38 }, away: { id: 'a', abbr: 'A', name: 'Away', score: 3 } });
    expect(nfl.excitement(blowout).hot).toBeNull();
  });
  it('normalized score: close and late beats a blowout and early, inside 0–100', () => {
    const close = nfl.excitement(g({ period: 4, clockSec: 300, home: { id: 'h', abbr: 'H', name: 'Home', score: 21 }, away: { id: 'a', abbr: 'A', name: 'Away', score: 20 } })).score;
    const early = nfl.excitement(g({ period: 1, clockSec: 800, home: { id: 'h', abbr: 'H', name: 'Home', score: 0 }, away: { id: 'a', abbr: 'A', name: 'Away', score: 0 } })).score;
    const blowout = nfl.excitement(g({ period: 4, clockSec: 300, home: { id: 'h', abbr: 'H', name: 'Home', score: 35 }, away: { id: 'a', abbr: 'A', name: 'Away', score: 7 } })).score;
    expect(close).toBeGreaterThan(early);
    expect(early).toBeGreaterThan(blowout);
    for (const x of [close, early, blowout]) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThanOrEqual(100);
  });
});

describe('NFL regional CBS/FOX windows', () => {
  const at1 = '2026-10-11T17:00Z';
  const game = (id: string, home: string, away: string, startTime = at1) => ({ game: snap({ id, sport: 'nfl', startTime, home: { id: home, abbr: home, name: `${home}town`, score: 0 }, away: { id: away, abbr: away, name: `${away}ville`, score: 0 } }), channel: 'CBS' });
  it('in a multi-game window only your market team (or the guide title) is confirmed', () => {
    const r = regionalStatus([game('1', 'NE', 'NYJ'), game('2', 'PHI', 'CAR'), game('3', 'TB', 'PIT')], ['NE']);
    expect(r.get('1')).toBe('confirmed');
    expect(r.get('2')).toBe('unconfirmed');
    expect(r.get('3')).toBe('unconfirmed');
    const withTitle = regionalStatus([game('1', 'NE', 'NYJ'), game('2', 'PHI', 'CAR')], [], new Map([['CBS', 'NFL Football: CARville at PHItown']]));
    expect(withTitle.get('2')).toBe('confirmed');
    expect(withTitle.get('1')).toBe('unconfirmed');
  });
  it('a game alone in its window (the late national game, SNF) is not regional', () => {
    const r = regionalStatus([game('1', 'NE', 'NYJ'), game('2', 'KC', 'LAC', '2026-10-11T20:25Z')], []);
    expect(r.size).toBe(0);
  });
});
