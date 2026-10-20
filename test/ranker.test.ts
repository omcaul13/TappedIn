import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../src/engine/ranker';
import type { Situation } from '../src/engine/types';
import { snap, view } from './helpers';

const rz: Situation = { possessionTeamId: 'h', down: 1, distance: 10, yardsToEndzone: 12, downDistanceText: '1st & 10 at X 12', possessionText: 'X 12', isRedZone: true, redZoneSource: 'derived', homeTimeouts: 3, awayTimeouts: 3, lastPlay: null };
const score = (home: number, away: number) => ({ home: { id: 'h', abbr: 'H', name: 'H', score: home }, away: { id: 'a', abbr: 'A', name: 'A', score: away } });
const none = { exclude: new Set<string>(), shownGames: new Set<string>(), shownChannels: new Set<number>() };

describe('ranker', () => {
  it('red zone beats a closer game', () => {
    const close = view(snap({ id: 'close', ...score(10, 10) }), 'LIVE', 849);
    const redzone = view(snap({ id: 'rz', ...score(35, 7), situation: rz }), 'LIVE', 850);
    expect(rankCandidates([close, redzone], none).ranked.map((c) => c.view.game.id)).toEqual(['rz', 'close']);
  });

  it('several red-zone games: closest score, then later in the game, then not shown elsewhere', () => {
    const a = view(snap({ id: 'a', ...score(21, 14), situation: rz, period: 2 }), 'LIVE', 849);
    const b = view(snap({ id: 'b', ...score(17, 14), situation: rz, period: 2, clockSec: 300 }), 'LIVE', 850);
    const c = view(snap({ id: 'c', ...score(17, 14), situation: rz, period: 4 }), 'LIVE', 805);
    expect(rankCandidates([a, b, c], none).ranked.map((x) => x.view.game.id)).toEqual(['c', 'b', 'a']);
  });

  it('no red zone: closest score, then later in the game', () => {
    const a = view(snap({ id: 'a', ...score(3, 0), period: 1 }), 'LIVE', 849);
    const b = view(snap({ id: 'b', ...score(3, 0), period: 4 }), 'LIVE', 850);
    const c = view(snap({ id: 'c', ...score(28, 0), period: 4 }), 'LIVE', 805);
    expect(rankCandidates([a, b, c], none).ranked.map((x) => x.view.game.id)).toEqual(['b', 'a', 'c']);
  });

  it('only live, in-play games on an available channel, never the home game', () => {
    const ok = view(snap({ id: 'ok' }), 'LIVE', 849);
    const brk = view(snap({ id: 'brk' }), 'BREAK', 850);
    const half = view(snap({ id: 'half', phase: 'HALFTIME' }), 'HALFTIME', 805);
    const espnPlus = view(snap({ id: 'plus', networks: ['ESPN+'] }), 'LIVE', null);
    const home = view(snap({ id: 'home' }), 'LIVE', 806);
    const r = rankCandidates([ok, brk, half, espnPlus, home], { ...none, exclude: new Set(['home']) });
    expect(r.ranked.map((x) => x.view.game.id)).toEqual(['ok']);
  });

  it('never a game or channel already on another screen, unless it is the only option', () => {
    const shown = view(snap({ id: 'shown', ...score(10, 10) }), 'LIVE', 849);
    const sameChannel = view(snap({ id: 'regional', ...score(10, 10) }), 'LIVE', 805);
    const other = view(snap({ id: 'other', ...score(40, 0) }), 'LIVE', 850);
    const opts = { ...none, shownGames: new Set(['shown']), shownChannels: new Set([805]) };
    const r = rankCandidates([shown, sameChannel, other], opts);
    expect(r.ranked.map((x) => x.view.game.id)).toEqual(['other']);
    expect(r.duplicateFallback).toBe(false);
    const onlyShown = rankCandidates([shown], opts);
    expect(onlyShown.ranked.map((x) => x.view.game.id)).toEqual(['shown']);
    expect(onlyShown.duplicateFallback).toBe(true);
  });

  it("another screen's sport (tier 2) is ordered by the normalized score, not that sport's own order", () => {
    const blowoutRz = view(snap({ id: 'rz', ...score(28, 0), period: 1, clockSec: 600, situation: rz }), 'LIVE', 849); // hot, but score 25
    const closeLate = view(snap({ id: 'close', ...score(17, 14), period: 4, clockSec: 120 }), 'LIVE', 850); // score ~80
    const r = rankCandidates([blowoutRz, closeLate], { ...none, homeSport: 'nhl', otherSports: new Set(['cfb'] as const) });
    expect(r.ranked.map((x) => [x.view.game.id, x.tier])).toEqual([['close', 2], ['rz', 2]]);
  });
});
