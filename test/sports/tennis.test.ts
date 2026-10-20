import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/engine';
import type { GameSnapshot, TennisInfo } from '../../src/engine/types';
import type { EspnClient } from '../../src/espn/client';
import { normalizeScoreboard } from '../../src/espn/normalize';
import { RankCache } from '../../src/espn/rankings';
import { atp, featureOrder, tennisChannelStatus, tennisExcitement, trimTennisScoreboard, wta } from '../../src/sports/tennis';
import { fixture, snap, T0, testConfig } from '../helpers';

// Tennis: parsing real ESPN scoreboards (10/19/2026: Brussels, Almaty, Lyon; Osaka, Ningbo, Rio),
// breaks read from scoreboard changes through the real engine, the shared-channel rules, excitement.

const atpBody = fixture('sports/tennis/atp-20261019.json');
const wtaBody = fixture('sports/tennis/wta-20261019.json');

describe('tennis scoreboard parsing', () => {
  const atpGames = normalizeScoreboard(atpBody, T0, 'atp');
  const wtaGames = normalizeScoreboard(wtaBody, T0, 'wta');
  const byId = (list: GameSnapshot[], id: string) => list.find((g) => g.id === id)!;

  it("keeps today's singles matches, with tour-prefixed ids", () => {
    expect(atpGames.length).toBe(15);
    expect(wtaGames.length).toBe(12);
    expect(atpGames.every((g) => g.id.startsWith('atp-') && g.sport === 'atp')).toBe(true);
    expect(wtaGames.every((g) => g.tennis?.tour === 'wta')).toBe(true);
  });
  it('reads players, sets, seeds, round, court and the tournament', () => {
    const g = byId(wtaGames, 'wta-185570');
    expect(g.shortName).toBe('Sakatsume vs Boulter');
    expect(g.home).toMatchObject({ abbr: 'Boulter', name: 'K. Boulter', score: 1 });
    expect(g.home.logo).toMatch(/gbr\.png$/);
    expect(g.tennis).toMatchObject({ tournament: 'Kinoshita Group Japan Open', grandSlam: false, round: 'Round 1', court: 'Center', bestOf: 3, seeds: { home: 8, away: null } });
    expect(g.tennis!.sets.map((s) => [s.home, s.away, s.done])).toEqual([[6, 3, true], [3, 1, false]]);
  });
  it('suspended is a delay; retired is final with the score', () => {
    expect(byId(wtaGames, 'wta-185570').phase).toBe('DELAYED');
    const ret = byId(atpGames, 'atp-187001');
    expect(ret.phase).toBe('FINAL');
    expect(ret.detail).toMatch(/ret\.$/);
  });
  it('tour-level ATP matches are best of three (ESPN says five)', () => {
    expect(atpGames.every((g) => g.tennis!.bestOf === 3)).toBe(true);
  });
  it('a Grand Slam: best of five for men, a listed network', () => {
    const slam = structuredClone(atpBody);
    slam.events[0].major = true;
    slam.events[0].groupings[0].competitions[0].broadcasts = [{ market: 'national', names: ['ESPN2'] }];
    const g = normalizeScoreboard(slam, T0, 'atp')[0];
    expect(g.tennis).toMatchObject({ grandSlam: true, bestOf: 5, networkListed: true });
    expect(g.networks).toEqual(['ESPN2']);
  });
  it('trimming keeps only what parsing keeps', () => {
    const big = fixture('sports/tennis/wta-20261019.json');
    expect(normalizeScoreboard(trimTennisScoreboard(big), T0, 'wta').map((g) => g.id)).toEqual(wtaGames.map((g) => g.id));
  });
});

// ---- a scripted match through the real engine ------------------------------------------------------

type SetScore = [home: number, away: number];
const template = wtaBody.events[0].groupings[0].competitions.find((c: { id: string }) => c.id === '185570');

/** A scoreboard with live matches `id` → sets (the last one in progress), on ESPN2 unless told otherwise. */
function board(matches: { id: string; sets: SetScore[]; court?: string; network?: string | null; state?: 'in' | 'post' | 'suspended' }[]) {
  const competitions = matches.map((m) => {
    const c = structuredClone(template);
    c.id = m.id;
    c.venue = { ...c.venue, court: m.court ?? 'Center' };
    c.broadcasts = m.network === null ? [] : [{ market: 'national', names: [m.network ?? 'ESPN2'] }];
    const state = m.state ?? 'in';
    c.status = state === 'in' ? { period: m.sets.length, type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, detail: 'In Progress', shortDetail: 'In Progress' } } : state === 'suspended' ? { period: m.sets.length, type: { name: 'STATUS_SUSPENDED', state: 'post', completed: false, detail: 'Suspended', shortDetail: 'Suspended' } } : { period: m.sets.length, type: { name: 'STATUS_FINAL', state: 'post', completed: true, detail: 'Final', shortDetail: 'Final' } };
    for (const cp of c.competitors) {
      const mine = cp.homeAway === 'home' ? 0 : 1;
      cp.linescores = m.sets.map((s, i) => {
        const done = i < m.sets.length - 1 || (Math.max(...s) >= 6 && Math.abs(s[0] - s[1]) >= 2) || Math.max(...s) === 7;
        return { value: s[mine], winner: done && s[mine] > s[1 - mine] };
      });
    }
    return c;
  });
  return { day: { date: '2026-10-17' }, events: [{ id: '345-2026', name: 'Japan Open', major: false, groupings: [{ grouping: { slug: 'womens-singles' }, competitions }] }] };
}

/** Feed scoreboards every 12 s (each held until the next step), tick every 2 s; returns the state of `id` over time. */
function run(steps: { atSec: number; body: unknown }[], sensitivity: 'low' | 'medium' | 'high', id = 'wta-m1') {
  const engine = new Engine(testConfig({ switching: { sensitivity } }), 1);
  const states: { t: number; state: string; reasons: string[] }[] = [];
  const end = steps.at(-1)!.atSec + 240;
  let body = steps[0].body;
  for (let s = 0; s <= end; s += 2) {
    const step = steps.filter((x) => x.atSec <= s).at(-1);
    if (step) body = step.body;
    const now = T0 + s * 1000;
    if (s % 12 === 0) engine.ingestScoreboard(body, now, 'wta');
    engine.tick(now);
    const a = engine.assessment(id);
    if (a && states.at(-1)?.state !== a.state) states.push({ t: s, state: a.state, reasons: a.reasons });
  }
  return states;
}
const breaks = (states: { t: number; state: string; reasons: string[] }[]) => states.filter((x) => x.state === 'BREAK');

describe('tennis breaks from the scoreboard', () => {
  // Games every ~4 min: 1-0, 1-1, 2-1 (changeover), 2-2, then the set ends 6-4 (set break).
  const steps = [
    { atSec: 0, body: board([{ id: 'm1', sets: [[0, 0]] }]) },
    { atSec: 240, body: board([{ id: 'm1', sets: [[1, 0]] }]) },
    { atSec: 480, body: board([{ id: 'm1', sets: [[1, 1]] }]) },
    { atSec: 720, body: board([{ id: 'm1', sets: [[2, 1]] }]) },
    { atSec: 960, body: board([{ id: 'm1', sets: [[2, 2]] }]) },
    { atSec: 1200, body: board([{ id: 'm1', sets: [[6, 4], [0, 0]] }]) },
  ];

  it('Medium: the changeover after game 3 and the set break switch; games 1, 2 and 4 do not', () => {
    const b = breaks(run(steps, 'medium'));
    expect(b.map((x) => x.reasons[0].split(':')[0])).toEqual(['Changeover', 'Set break']);
    expect(b[0].t).toBeGreaterThanOrEqual(720);
    expect(b[0].t).toBeLessThan(740);
  });
  it('Low: set breaks only', () => {
    const b = breaks(run(steps, 'low'));
    expect(b.map((x) => x.reasons[0].split(':')[0])).toEqual(['Set break']);
  });
  it('a break ends on its own once the changeover is over on screen (no play-by-play to say so)', () => {
    const states = run(steps, 'medium');
    const start = states.findIndex((x) => x.state === 'BREAK');
    const back = states[start + 1];
    expect(back.state).toBe('LIVE');
    const fillSec = back.t - states[start].t;
    expect(fillSec).toBeGreaterThanOrEqual(70);
    expect(fillSec).toBeLessThanOrEqual(110);
    expect(back.reasons[0]).toMatch(/over on your screen/);
  });
  it('a changeover is no break while another match is live on the same channel (the producer cuts to it)', () => {
    const other = { id: 'm2', sets: [[3, 3]] as SetScore[], court: 'Court 1' };
    const shared = steps.map((s, i) => ({ atSec: s.atSec, body: board([{ id: 'm1', sets: [[[0, 0]], [[1, 0]], [[1, 1]], [[2, 1]], [[2, 2]], [[6, 4], [0, 0]]][i] as SetScore[] }, other]) }));
    const b = breaks(run(shared, 'medium'));
    expect(b.map((x) => x.reasons[0].split(':')[0])).toEqual(['Set break']);
  });
  it('a suspension (rain, darkness) is a delay at every level', () => {
    const b = breaks(run([{ atSec: 0, body: board([{ id: 'm1', sets: [[2, 2]] }]) }, { atSec: 60, body: board([{ id: 'm1', sets: [[2, 2]], state: 'suspended' }]) }], 'low'));
    expect(b[0].reasons[0]).toMatch(/delayed/);
  });
});

// ---- channels ------------------------------------------------------------------------------------

const info = (o: Partial<TennisInfo> = {}): TennisInfo => ({ tour: 'wta', tournament: 'Japan Open', grandSlam: false, round: 'Round 1', court: 'Court 2', bestOf: 3, sets: [{ home: 3, away: 2, tbHome: null, tbAway: null, done: false }], seeds: { home: null, away: null }, ranks: { home: null, away: null }, server: null, points: null, networkListed: true, ...o });
const match = (id: string, o: Partial<TennisInfo> = {}, s: Partial<GameSnapshot> = {}) =>
  snap({ id, sport: 'wta', home: { id: `${id}h`, abbr: 'Boulter', name: 'K. Boulter', score: 0 }, away: { id: `${id}a`, abbr: 'Gibson', name: 'T. Gibson', score: 0 }, ...s, tennis: info(o) });

describe('which court a channel shows', () => {
  it('the feature match: a listed broadcast, then the main court, then the seeds', () => {
    expect(featureOrder([match('a', { court: 'Court 2' }), match('b', { court: 'Centre Court' }), match('c', { court: 'Court 1', seeds: { home: 1, away: null } })])).toEqual(['b', 'c', 'a']);
    expect(featureOrder([match('a', { court: 'Center' }), match('b', { court: 'Court 3', networkListed: true }), match('c', { court: 'Center', networkListed: false })])[0]).toBe('a');
  });
  it('shared channels: one confirmed, the others courts-vary; assumed networks are never confirmed', () => {
    const { status, shared } = tennisChannelStatus([
      { game: match('a', { court: 'Center' }), channel: 'ESPN2' },
      { game: match('b', { court: 'Court 4' }), channel: 'ESPN2' },
      { game: match('c', { networkListed: false }), channel: 'Tennis Channel' },
      { game: match('d', {}), channel: 'ESPN' },
    ]);
    expect(Object.fromEntries(status)).toEqual({ a: 'confirmed', b: 'unconfirmed', c: 'unconfirmed' });
    expect([...shared].sort()).toEqual(['a', 'b']);
  });
  it('a program title naming a player wins', () => {
    const { status } = tennisChannelStatus([{ game: match('a', { court: 'Center' }), channel: 'ESPN2' }, { game: match('b', { court: 'Court 4' }, { home: { id: 'x', abbr: 'Swiatek', name: 'I. Swiatek', score: 0 } }), channel: 'ESPN2' }], new Map([['ESPN2', 'Tennis: Swiatek vs. Pegula']]));
    expect(status.get('b')).toBe('confirmed');
    expect(status.get('a')).toBe('unconfirmed');
  });
  it('tour matches with no network are assumed on Tennis Channel', () => {
    const engine = new Engine(testConfig({ channels: { 'Tennis Channel': { number: 838, aliases: ['Tennis Channel'] } } }), 1);
    engine.ingestScoreboard(board([{ id: 'm1', sets: [[1, 0]], network: null }]), T0, 'wta');
    engine.tick(T0);
    expect(engine.views().get('wta-m1')!.channel).toMatchObject({ name: 'Tennis Channel', number: 838, regional: 'unconfirmed' });
  });
});

// ---- excitement ----------------------------------------------------------------------------------

describe('tennis excitement', () => {
  const set = (home: number, away: number, done = false) => ({ home, away, tbHome: null, tbAway: null, done });
  const g = (o: Partial<TennisInfo>) => match('x', o);
  it('points: match point, set point, break point (the bigger moment wins)', () => {
    const mp = tennisExcitement(g({ sets: [set(6, 4, true), set(5, 3)], server: 'home', points: { home: '40', away: '15' } }));
    expect(mp.hot?.label).toBe('match point Boulter');
    const sp = tennisExcitement(g({ sets: [set(5, 3)], server: 'home', points: { home: '40', away: '15' } }));
    expect(sp.hot?.label).toBe('set point Boulter');
    const bp = tennisExcitement(g({ sets: [set(2, 2)], server: 'home', points: { home: '30', away: '40' } }));
    expect(bp.hot?.label).toBe('break point Gibson');
    // Each one lifts the score over the same game score without it.
    const plain = (sets: ReturnType<typeof set>[]) => tennisExcitement(g({ sets, server: 'home', points: { home: '15', away: '15' } })).score;
    expect(mp.score).toBeGreaterThan(plain([set(6, 4, true), set(5, 3)]));
    expect(sp.score).toBeGreaterThan(plain([set(5, 3)]));
    expect(bp.score).toBeGreaterThan(plain([set(2, 2)]));
    expect(mp.score - plain([set(6, 4, true), set(5, 3)])).toBeGreaterThan(sp.score - plain([set(5, 3)]));
    expect(tennisExcitement(g({ sets: [set(2, 2)], server: 'home', points: { home: '40', away: '40' } })).hot).toBeNull();
    expect(tennisExcitement(g({ sets: [set(2, 2)], server: 'away', points: { home: 'AD', away: '40' } })).hot?.label).toBe('break point Boulter');
  });
  it('a tiebreak, a deciding set, and (without points) a game from the set', () => {
    expect(tennisExcitement(g({ sets: [set(6, 6)] })).hot?.label).toBe('tiebreak');
    expect(tennisExcitement(g({ sets: [set(6, 4, true), set(3, 6, true), set(6, 6)] })).hot?.label).toBe('deciding-set tiebreak');
    expect(tennisExcitement(g({ sets: [set(6, 4, true), set(3, 6, true), set(1, 1)] })).hot?.label).toBe('deciding set');
    // A Grand Slam's final-set tiebreak goes to 10: 6-2 is not match point there, 9-2 is.
    const slamTb = (home: string) => tennisExcitement(g({ sets: [set(6, 4, true), set(3, 6, true), set(6, 6)], grandSlam: true, server: 'home', points: { home, away: '2' } })).hot?.label;
    expect(slamTb('6')).toBe('deciding-set tiebreak');
    expect(slamTb('9')).toBe('match point Boulter');
    expect(tennisExcitement(g({ sets: [set(6, 4, true), set(3, 6, true), set(6, 6)], server: 'home', points: { home: '6', away: '2' } })).hot?.label).toBe('match point Boulter');
    expect(tennisExcitement(g({ sets: [set(5, 4)] })).hot?.label).toBe('Boulter a game from the set');
    expect(tennisExcitement(g({ sets: [set(6, 4, true), set(5, 3)] })).hot?.label).toBe('Boulter a game from the match');
  });
  it('an upset: the unseeded player leads a seed in sets', () => {
    const x = tennisExcitement(g({ sets: [set(3, 6, true), set(1, 1)], seeds: { home: 2, away: null } }));
    expect(x.hot?.label).toBe('upset brewing: Gibson leads');
    expect(x.score).toBeGreaterThan(tennisExcitement(g({ sets: [set(3, 6, true), set(1, 1)] })).score);
  });
  it('scores stay 0–100 and finals score 0', () => {
    expect(tennisExcitement(g({ sets: [set(6, 4, true), set(3, 6, true), set(6, 6)], grandSlam: true, seeds: { home: 1, away: null }, server: 'home', points: { home: '6', away: '6' } })).score).toBeLessThanOrEqual(100);
    expect(tennisExcitement(match('f', {}, { phase: 'FINAL' })).score).toBe(0);
  });
  it('ATP and WTA are separate sports in the tennis family', () => {
    expect([atp.id, atp.family, atp.name, wta.id, wta.short]).toEqual(['atp', 'tennis', 'ATP Tennis', 'wta', 'WTA']);
    expect(atp.highlights).toBeUndefined();
    expect(atp.phaseOf('STATUS_IN_PROGRESS', 'in', '', 2)).toBe('LIVE');
    expect(atp.phaseOf('STATUS_WALKOVER', 'post', '', 1)).toBe('FINAL');
  });
});

describe('the day a match belongs to', () => {
  it('keeps a final dated the day before (it ended after midnight), drops older ones', () => {
    const final = (id: string) => ({ id, sets: [[6, 4], [6, 3]] as SetScore[], state: 'post' as const });
    const b = board([final('old'), final('late'), final('today'), final('next')]); // the board's day is 10/17
    const cs = b.events[0].groupings[0].competitions;
    cs[0].date = '2026-10-16T03:30Z'; // 23:30 ET on 10/15: too old
    cs[1].date = '2026-10-17T03:30Z'; // 23:30 ET on 10/16: ended after midnight
    cs[2].date = '2026-10-17T15:00Z';
    cs[3].date = '2026-10-18T04:30Z'; // 00:30 ET on 10/18: the app ran past midnight
    expect(normalizeScoreboard(b, T0, 'wta').map((g) => g.id)).toEqual(['wta-late', 'wta-today', 'wta-next']);
  });
});

describe('world rankings', () => {
  it('a failed fetch is retried after a wait, not kept for the whole day', async () => {
    let t = 0;
    let fail = true;
    let calls = 0;
    const client = {
      rankingsUrl: () => 'rankings',
      getJson: async () => {
        calls++;
        if (fail) throw new Error('ESPN down');
        return { body: { rankings: [{ ranks: [{ athlete: { id: 7 }, current: 3 }] }] } };
      },
    } as unknown as EspnClient;
    const ranks = new RankCache(client, () => t);
    expect(await ranks.get('atp', '20261019')).toEqual({});
    fail = false;
    t = 60_000;
    expect(await ranks.get('atp', '20261019')).toEqual({}); // too soon to ask again
    t = 11 * 60_000;
    expect(await ranks.get('atp', '20261019')).toEqual({ '7': 3 });
    expect(await ranks.get('atp', '20261019')).toEqual({ '7': 3 }); // cached for the day
    expect(calls).toBe(2);
  });
});
