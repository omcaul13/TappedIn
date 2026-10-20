import { describe, expect, it } from 'vitest';
import { gameDTO, type GameDTO, type ScreenDTO } from '../src/server/state';
import type { GameSnapshot, TennisInfo } from '../src/engine/types';
import { clockLine, compactLine, formatCard, TickerAlerts, tickerGames, tickerSections, tickerVisibility, wantsAllSports } from '../src/ui/ticker/model';
import { snap } from './helpers';

// The tickers' shared model: visibility rules, which games, how each sport reads, alerts.

const dto = (s: GameSnapshot, channel: GameDTO['channel'] = { name: 'ESPN', number: 849 }) => gameDTO(s, undefined, channel, null);
const team = (id: string, abbr: string, score: number, extra: object = {}) => ({ id, abbr, name: abbr, score, ...extra });

describe('which ticker shows', () => {
  it('never two at once: the mini ticker hides while the big one is on', () => {
    expect(tickerVisibility({ big: false, mini: true })).toEqual({ big: false, mini: true });
    expect(tickerVisibility({ big: true, mini: true })).toEqual({ big: true, mini: false });
    expect(tickerVisibility({ big: true, mini: false })).toEqual({ big: true, mini: false });
    expect(tickerVisibility({ big: false, mini: false })).toEqual({ big: false, mini: false });
  });
  it('unfollowed sports are polled only while a visible ticker shows all sports', () => {
    expect(wantsAllSports({ big: false, mini: true, scope: 'followed', miniScope: 'all' })).toBe(true);
    expect(wantsAllSports({ big: true, mini: true, scope: 'followed', miniScope: 'all' })).toBe(false); // mini hidden
    expect(wantsAllSports({ big: true, mini: false, scope: 'all' })).toBe(true);
    expect(wantsAllSports({ big: false, mini: false, scope: 'all' })).toBe(false);
  });
});

describe('which games', () => {
  const a = dto(snap({ id: 'a', sport: 'nhl' }));
  const b = dto(snap({ id: 'b', sport: 'nhl' }));
  const c = dto(snap({ id: 'c', sport: 'cfb' }));
  const x = dto(snap({ id: 'x', sport: 'mlb' }));
  const screens = [{ homeGameId: 'a', showingGameId: 'c' }, { homeGameId: null, showingGameId: null }] as ScreenDTO[];
  const st = { games: [a, b, c], screens, tickerExtra: [x] };
  it('my screens / followed sports / all sports', () => {
    expect(tickerGames(st, 'screens').map((g) => g.id)).toEqual(['a', 'c']);
    expect(tickerGames(st, 'followed').map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(tickerGames(st, 'all').map((g) => g.id)).toEqual(['a', 'b', 'c', 'x']);
  });
  it('groups by sport, sports with live games first; live, then upcoming, then finals', () => {
    const pre = dto(snap({ id: 'p', sport: 'cfb', phase: 'PRE', startTime: '2026-10-17T23:00:00Z' }));
    const fin = dto(snap({ id: 'f', sport: 'mlb', phase: 'FINAL' }));
    const live = dto(snap({ id: 'l', sport: 'nhl' }));
    const sections = tickerSections([fin, pre, live, c], ['cfb', 'nhl', 'mlb']);
    expect(sections.map((s) => s.sport)).toEqual(['cfb', 'nhl', 'mlb']);
    expect(sections[0].games.map((g) => g.id)).toEqual(['c', 'p']);
    expect(tickerSections([fin, pre], ['cfb', 'nhl', 'mlb']).map((s) => s.sport)).toEqual(['cfb', 'mlb']);
  });
  it('the CFB top-25 filter leaves other sports alone', () => {
    const ranked = dto(snap({ id: 'r', sport: 'cfb', home: team('h', 'UGA', 7, { rank: 3 }) }));
    const kept = tickerSections([ranked, c, a], ['cfb', 'nhl'], { cfbTop25: true }).flatMap((s) => s.games.map((g) => g.id));
    expect(kept.sort()).toEqual(['a', 'r']);
  });
});

describe('sport-appropriate formats', () => {
  it('football: quarter and clock, down & distance, red zone, possession', () => {
    const g = dto(snap({ sport: 'cfb', detail: '4:12 - 2nd', home: team('h', 'MIA', 14), away: team('a', 'FSU', 10), situation: { possessionTeamId: 'h', down: 3, distance: 7, yardsToEndzone: 12, downDistanceText: '3rd & 7 at FSU 12', possessionText: null, isRedZone: true, redZoneSource: 'espn', homeTimeouts: 3, awayTimeouts: 3, lastPlay: null } }));
    const card = formatCard(g);
    expect(card.s1).toBe('2ND 4:12');
    expect(card.s2).toBe('3RD & 7 AT FSU 12 · RED ZONE');
    expect(card.tone).toBe('hot');
    expect(card.rows.map((r) => r.poss)).toEqual([false, true]);
    expect(compactLine(g)).toBe('CFB · FSU 10–14 MIA · 2nd 4:12 · 3rd & 7 at FSU 12 · Red zone');
  });
  it('hockey: the power play', () => {
    const g = dto(snap({ sport: 'nhl', detail: '4:12 - 3rd', home: team('h', 'TOR', 1), away: team('a', 'BOS', 2), live: { family: 'hockey', lastPlay: null, strength: 'pp', advantageTeamId: 'a' } }));
    expect(compactLine(g)).toBe('NHL · BOS 2–1 TOR · 3rd 4:12 · PP BOS');
  });
  it('baseball: half-inning, outs, count, runners in scoring position, batting team', () => {
    const g = dto(snap({ sport: 'mlb', period: 7, detail: 'Bot 7th', live: { family: 'baseball', lastPlay: null, half: 'bottom', outs: 2, balls: 1, strikes: 2, onFirst: false, onSecond: true, onThird: false, homeHits: 5, awayHits: 6 } }));
    const card = formatCard(g);
    expect([card.s1, card.s2, card.tone]).toEqual(['BOT 7TH', '2 OUT · 1-2 · RISP', 'hot']);
    expect(card.bases).toEqual([false, true, false]);
    expect(card.rows[1].poss).toBe(true);
  });
  it('before and after: kickoff time and network; finals, overtime, an upset', () => {
    expect(clockLine(dto(snap({ phase: 'FINAL', detail: 'Final/OT', sport: 'nba' })))).toBe('Final/OT');
    expect(clockLine(dto(snap({ phase: 'FINAL', detail: 'Final/10', sport: 'mlb' })))).toBe('F/10');
    expect(clockLine(dto(snap({ phase: 'HALFTIME', sport: 'nhl', period: 2 })))).toBe('End 2nd');
    const upset = dto(snap({ phase: 'FINAL', sport: 'cfb', home: team('h', 'UGA', 10, { rank: 2 }), away: team('a', 'VAN', 17) }));
    expect(formatCard(upset).s2).toBe('UPSET');
    expect(formatCard(upset).rows.map((r) => r.lose)).toEqual([false, true]);
    const pre = dto(snap({ phase: 'PRE', sport: 'cfb', home: team('h', 'UGA', 0, { record: '6-1' }) }));
    expect(formatCard(pre).rows[1].record).toBe('6-1');
    expect(formatCard(pre).s2).toBe('ESPN');
  });
  it('tennis: sets, points, server, break point, the tournament', () => {
    const info: TennisInfo = {
      tour: 'atp', tournament: 'Kinoshita Group Japan Open', grandSlam: false, round: 'Round 2', court: 'Center', bestOf: 3,
      sets: [{ home: 4, away: 6, tbHome: null, tbAway: null, done: true }, { home: 2, away: 3, tbHome: null, tbAway: null, done: false }],
      seeds: { home: 1, away: null }, ranks: { home: null, away: null }, server: 'home', points: { home: '30', away: '40' }, networkListed: true,
    };
    const g = dto(snap({ sport: 'atp', home: team('h', 'Sinner', 0), away: team('a', 'Alcaraz', 1), tennis: info }));
    const card = formatCard(g);
    expect(card.s1).toBe('SET 2');
    expect(card.s2).toBe('40–30 · BP ALCARAZ');
    expect(card.rows[1]).toMatchObject({ rank: '1', score: '30', poss: true, sets: [{ games: '4' }, { games: '2' }] });
    expect(compactLine(g)).toBe('ATP · Alcaraz 6-4 3-2 Sinner · Set 2 · 40–30 · BP Alcaraz');
    const pre = dto(snap({ sport: 'atp', phase: 'PRE', home: team('h', 'Sinner', 0), away: team('a', 'Alcaraz', 0), tennis: { ...info, sets: [], points: null, server: null } }));
    expect(compactLine(pre)).toMatch(/^ATP · Alcaraz vs Sinner · /);
  });
});

describe('alerts', () => {
  const g = (o: Partial<GameSnapshot>) => dto(snap({ id: 'g', sport: 'cfb', home: team('h', 'MIA', 7), away: team('a', 'FSU', 3), ...o }));
  it('nothing on first sight; a touchdown, then the PAT keeps the same alert', () => {
    const al = new TickerAlerts();
    expect(al.update([g({})], 0)).toEqual([]);
    expect(al.update([g({ home: team('h', 'MIA', 13) })], 1000).map((a) => a.label)).toEqual(['Touchdown MIA']);
    expect(al.update([g({ home: team('h', 'MIA', 14) })], 2000)).toEqual([]);
    expect(al.active('g', 70_000)?.label).toBe('Touchdown MIA');
    expect(al.active('g', 200_000)).toBeNull();
  });
  it('a new hot moment is an alert; the same one again is not', () => {
    const al = new TickerAlerts();
    const nhl = (strength: 'pp' | 'even') => dto(snap({ id: 'n', sport: 'nhl', period: 2, clockSec: 600, live: { family: 'hockey', lastPlay: null, strength, advantageTeamId: 'hn' }, home: team('hn', 'BOS', 1), away: team('an', 'TOR', 1) }));
    al.update([nhl('even')], 0);
    expect(al.update([nhl('pp')], 1000).map((a) => a.label)).toEqual(['BOS power play']);
    expect(al.update([nhl('pp')], 2000)).toEqual([]);
  });
  it('a hot-moment alert ends when the moment does (the drive leaves the red zone)', () => {
    const al = new TickerAlerts();
    const nhl = (strength: 'pp' | 'even') => dto(snap({ id: 'n', sport: 'nhl', period: 2, clockSec: 600, live: { family: 'hockey', lastPlay: null, strength, advantageTeamId: 'hn' }, home: team('hn', 'BOS', 1), away: team('an', 'TOR', 1) }));
    al.update([nhl('even')], 0);
    al.update([nhl('pp')], 1000);
    expect(al.active('n', 2000)?.label).toBe('BOS power play');
    al.update([nhl('even')], 10_000);
    expect(al.active('n', 11_000)).toBeNull();
    expect(formatCard(nhl('even'), al.active('n', 11_000)).s2).not.toMatch(/POWER PLAY/);
  });
  it('goals, runs and tennis sets', () => {
    const al = new TickerAlerts();
    const h = (score: number) => dto(snap({ id: 'h', sport: 'nhl', home: team('x', 'BOS', score), away: team('y', 'TOR', 0) }));
    al.update([h(0)], 0);
    expect(al.update([h(1)], 1).map((a) => a.label)).toEqual(['Goal BOS']);
    const set = (done: boolean, homeSets: number) => dto(snap({ id: 't', sport: 'wta', home: team('p', 'Gauff', homeSets), away: team('q', 'Swiatek', 0), tennis: { tour: 'wta', tournament: 'T', grandSlam: false, round: null, court: null, bestOf: 3, sets: [{ home: 6, away: 4, tbHome: null, tbAway: null, done }], seeds: { home: null, away: null }, ranks: { home: null, away: null }, server: null, points: null, networkListed: true } }));
    al.update([set(false, 0)], 0);
    expect(al.update([set(true, 1)], 1).map((a) => a.label)).toEqual(['Set Gauff']);
  });
});
