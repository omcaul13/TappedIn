import { describe, expect, it } from 'vitest';
import { createComcastAdapter } from '../../src/providers/comcast/adapter';
import { loadProviderConfig } from '../../src/providers/registry';
import type { ChannelRef } from '../../src/providers/types';

const xoc = createComcastAdapter(loadProviderConfig('xfinity-on-campus'));
const espn: ChannelRef = { name: 'ESPN', number: 849, callSign: 'ESPND', ref: null };

describe('Comcast TV-APP adapter', () => {
  it('onChannel matches the call sign at the end of the live URL', () => {
    expect(xoc.onChannel('https://www.xfinity.com/stream/live/college-football/123/ESPND', espn)).toBe(true);
    expect(xoc.onChannel('https://www.xfinity.com/stream/live/college-football/123/espnd?x=1', espn)).toBe(true);
    expect(xoc.onChannel('https://www.xfinity.com/stream/live/college-football/123/ES2HD', espn)).toBe(false);
    expect(xoc.onChannel('https://www.xfinity.com/stream/live/x/1/ES2HD', { ...espn, callSign: null })).toBe(true);
  });

  it('isOnPlayer is true on live pages only', () => {
    expect(xoc.isOnPlayer('https://www.xfinity.com/stream/live/x/1/ESPND')).toBe(true);
    expect(xoc.isOnPlayer('https://www.xfinity.com/stream/listings')).toBe(false);
  });

  it('isWarm means parked on the guide', () => {
    expect(xoc.isWarm({ url: () => 'https://www.xfinity.com/stream/listings' } as never)).toBe(true);
    expect(xoc.isWarm({ url: () => 'https://www.xfinity.com/stream/live/x/1/ESPND' } as never)).toBe(false);
  });
});
