import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import type { LiveDetail } from '../src/engine/types';
import { sec, snap, T0, testConfig } from './helpers';

describe('engine over a long session', () => {
  it('forgets finals that have been off the scoreboard for 6 hours', () => {
    const e = new Engine(testConfig());
    e.store.ingestSnapshots([snap({ id: 'old', phase: 'FINAL' }), snap({ id: 'today' })], T0);
    e.store.ingestSnapshots([snap({ id: 'today' })], T0 + 7 * 3600_000);
    e.tick(T0 + 7 * 3600_000);
    expect(e.store.get('old')).toBeUndefined();
    expect(e.store.get('today')).toBeDefined();
  });

  it("drops a hockey power play read from play-by-play that isn't fetched any more", () => {
    const e = new Engine(testConfig());
    const g = snap({ id: 'h', sport: 'nhl' });
    e.store.ingestSnapshots([g], T0);
    const pp = { family: 'hockey', strength: 'pp' } as unknown as LiveDetail;
    Object.assign(e.store.get('h')!, { playsLive: pp, playsLiveAt: T0 });
    e.tick(T0);
    expect(e.views().get('h')!.game.live).toBe(pp);
    e.store.ingestSnapshots([g], T0 + sec(300));
    e.tick(T0 + sec(300));
    expect(e.views().get('h')!.game.live).not.toBe(pp);
  });
});
