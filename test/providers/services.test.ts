import { describe, expect, it } from 'vitest';
import { createAdapter, loadProviderConfig } from '../../src/providers/registry';
import type { ChannelRef } from '../../src/providers/types';
import { refFromText, UrlTuningSchema } from '../../src/providers/url/adapter';

const url = (id: string) => UrlTuningSchema.parse(loadProviderConfig(id).tuning);
const ch = (ref: string): ChannelRef => ({ name: 'ESPN', number: 1, callSign: null, ref });

describe('Spectrum', () => {
  for (const id of ['spectrum-tv', 'spectrumu']) {
    it(`${id}: station id from the guide logo, tuned with ?tmsid=`, () => {
      const t = url(id);
      if (t.lineup.mode !== 'dom') throw new Error('expected a DOM scan');
      expect(refFromText('https://spectrum.net/guide/10179?width=50&sourceType=colorhybrid', t.lineup.ref.pattern)).toBe('10179');
      expect(t.watchUrl.replace('{ref}', '10179')).toBe('https://watch.spectrum.net/livetv?tmsid=10179');
      const a = createAdapter(id);
      expect(a.onChannel('https://watch.spectrum.net/livetv?tmsid=10179', ch('10179'))).toBe(true);
      expect(a.onChannel('https://watch.spectrum.net/livetv?tmsid=1', ch('10179'))).toBe(false);
    });
  }

  it('SpectrumU is the campus product', () => {
    expect(loadProviderConfig('spectrumu').kind).toBe('campus');
    expect(loadProviderConfig('spectrum-tv').kind).toBe('consumer');
  });
});

describe('YouTube TV', () => {
  it('watch id from the guide link, channel name from its label', () => {
    const t = url('youtube-tv');
    if (t.lineup.mode !== 'dom') throw new Error('expected a DOM scan');
    expect(refFromText('/watch/niY10UGQat0', t.lineup.ref.pattern)).toBe('niY10UGQat0');
    expect(refFromText('watch/niY10UGQat0', t.lineup.ref.pattern)).toBe('niY10UGQat0');
    expect(refFromText('browse/abc', t.lineup.ref.pattern)).toBeNull();
    expect(refFromText('watch ESPN', t.lineup.label.pattern)).toBe('ESPN');
    expect(createAdapter('youtube-tv').onChannel('https://tv.youtube.com/watch/niY10UGQat0?x=1', ch('niY10UGQat0'))).toBe(true);
  });

  it('uses the real browser identity until the sign-in spike says otherwise', () => {
    expect(loadProviderConfig('youtube-tv').shell.userAgent).toBe('default');
  });
});

describe('Sling', () => {
  it('channel guid from the guide data, only ribbons that can play', () => {
    const t = url('sling');
    if (t.lineup.mode !== 'response') throw new Error('expected a response scan');
    expect(refFromText('0123456789abcdef0123456789abcdef', t.lineup.refPattern)).toBe('0123456789abcdef0123456789abcdef');
    expect(refFromText('not-a-guid', t.lineup.refPattern)).toBeNull();
    expect(t.lineup.require).toBe('tiles[].actions.PLAY_CONTENT');
    expect(t.lineup.maxScrolls).toBeGreaterThan(0);
    expect(t.watchUrl.replace('{ref}', 'g')).toBe('https://watch.sling.com/1/channel/g/watch');
  });
});

describe('Cox Contour', () => {
  it('uses the Comcast TV-APP at watchtv.cox.com with the Watch Now play button', () => {
    for (const id of ['cox-contour', 'cox-contour-campus']) {
      const c = loadProviderConfig(id);
      expect(c.family).toBe('comcast');
      expect((c.tuning as { listingsUrl: string }).listingsUrl).toBe('https://watchtv.cox.com/listings');
      expect((c.tuning as { watchNowButton: { text: string } }).watchNowButton.text).toBe('^Watch Now$');
      expect(createAdapter(id).config.id).toBe(id);
    }
  });

  it('campus sign-in starts at the school picker', () => {
    expect(loadProviderConfig('cox-contour-campus').signin.startUrl).toBe('https://campus.cox.com/');
    expect(loadProviderConfig('cox-contour-campus').documentedMaxStreams).toBe(1);
  });
});
