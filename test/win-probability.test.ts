import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { winProbability } from '../src/espn/normalize';
import { sec, snap, T0, testConfig } from './helpers';

const summary = (home: number, tie = 0) => ({ winprobability: [{ homeWinPercentage: 0.5, tiePercentage: 0, playId: '1' }, { homeWinPercentage: home, tiePercentage: tie, playId: '2' }] });

describe('win probability', () => {
  it("reads the newest entry of ESPN's list, and nothing when it's missing or out of range", () => {
    expect(winProbability(summary(0.68))).toEqual({ home: 0.68, tie: 0 });
    expect(winProbability({})).toBeNull();
    expect(winProbability({ winprobability: [] })).toBeNull();
    expect(winProbability(summary(68))).toBeNull();
  });

  it('shows on a game in play while its summary is fetched, not once it goes stale or ends', () => {
    const e = new Engine(testConfig());
    e.store.ingestSnapshots([snap({ id: 'g' })], T0);
    e.ingestSummary('g', summary(0.3), T0);
    e.tick(T0);
    expect(e.views().get('g')!.game.winProbability).toEqual({ home: 0.3, tie: 0 });
    e.store.ingestSnapshots([snap({ id: 'g' })], T0 + sec(300)); // no summary for 5 minutes
    e.tick(T0 + sec(300));
    expect(e.views().get('g')!.game.winProbability).toBeUndefined();
    e.ingestSummary('g', summary(1), T0 + sec(310));
    e.store.ingestSnapshots([snap({ id: 'g', phase: 'FINAL' })], T0 + sec(310));
    e.tick(T0 + sec(310));
    expect(e.views().get('g')!.game.winProbability).toBeUndefined();
  });
});
