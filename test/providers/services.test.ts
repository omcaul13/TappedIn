import { describe, expect, it } from 'vitest';
import { matchLineup } from '../../src/providers/networks';
import { createAdapter, loadProviderConfig } from '../../src/providers/registry';
import { compileRegex, type ChannelRef } from '../../src/providers/types';
import { itemsFromJson, refFromText, UrlTuningSchema } from '../../src/providers/url/adapter';
import schedule from '../fixtures/providers/paramount-schedule.json';

const url = (id: string) => UrlTuningSchema.parse(loadProviderConfig(id).tuning);
const ch = (ref: string): ChannelRef => ({ name: 'ESPN', number: 1, callSign: null, ref });

describe('Spectrum', () => {
  for (const id of ['spectrum-tv', 'spectrumu']) {
    it(`${id}: station id from the guide logo, tuned with ?tmsid=`, () => {
      const t = url(id);
      if (t.lineup.mode !== 'dom') throw new Error('expected a DOM scan');
      expect(refFromText('https://spectrum.net/guide/10179?width=50&sourceType=colorhybrid', t.lineup.ref.pattern)).toBe('10179');
      expect(t.watchUrl!.replace('{ref}', '10179')).toBe('https://watch.spectrum.net/livetv?tmsid=10179');
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
    expect(t.watchUrl!.replace('{ref}', 'g')).toBe('https://watch.sling.com/1/channel/g/watch');
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

describe('Hulu + Live TV and DIRECTV: no channel URL, tuned by guide clicks', () => {
  it('Hulu: row name from data-testid, display name from the screen-reader text', () => {
    const t = url('hulu-live');
    if (t.lineup.mode !== 'dom' || !t.click) throw new Error('expected a DOM scan and click tuning');
    expect(t.watchUrl).toBeNull();
    expect(refFromText('live-guide-channel-kyber-espn', t.lineup.ref.pattern)).toBe('espn');
    expect(refFromText('ESPN Details, row 12 of 90. On now', t.lineup.label.pattern)).toBe('ESPN');
    expect(t.click.before).toBe('#CHANNELS');
    expect(loadProviderConfig('hulu-live').documentedMaxStreams).toBe(2);
  });

  it('DIRECTV: logo aria-label is the id, clicked with element.click()', () => {
    const t = url('directv');
    if (t.lineup.mode !== 'dom' || !t.click) throw new Error('expected a DOM scan and click tuning');
    expect(refFromText('view ESPN', t.lineup.ref.pattern)).toBe('ESPN');
    expect(t.click.how).toBe('dom');
    // The guide must not count as the player: the hide script would make it invisible before the clicks.
    expect(createAdapter('directv').isOnPlayer('https://stream.directv.com/guide')).toBe(false);
  });
});

describe('Fubo', () => {
  it('Gracenote station id from the guide link, tuned with ?channelId=', () => {
    const t = url('fubo');
    if (t.lineup.mode !== 'dom') throw new Error('expected a DOM scan');
    expect(refFromText('/p/watch?channelId=10179&type=live', t.lineup.ref.pattern)).toBe('10179');
    expect(t.watchUrl!.replace('{ref}', '10179')).toBe('https://www.fubo.tv/p/watch?channelId=10179&type=live');
    const a = createAdapter('fubo');
    expect(a.onChannel('https://www.fubo.tv/p/watch?channelId=10179&type=live', ch('10179'))).toBe(true);
    expect(a.onChannel('https://www.fubo.tv/p/watch?channelId=12444&type=live', ch('10179'))).toBe(false);
  });
});

describe('Paramount+', () => {
  it('lineup from the schedule.json the Live TV page downloads: only the local station, as CBS', () => {
    const t = url('paramount-plus');
    if (t.lineup.mode !== 'response') throw new Error('expected a response scan');
    expect(compileRegex(t.lineup.responseUrl).test('https://www.paramountplus.com/live-tv/stream/liveSchedulePlayer/schedule.json?x=1')).toBe(true);
    // Real schedule.json (trimmed to slug, name and brand) from a Premium account in Boston.
    const rows = itemsFromJson(schedule, t.lineup);
    // Only the local station: "CBS Sports HQ" would match CBS Sports Network, "nfl-on-cbs" NFL Network.
    expect(rows).toEqual([{ label: 'CBS', number: null, callSign: null, ref: 'wbz' }]);
    const lineup = matchLineup(rows);
    expect(lineup.CBS?.ref).toBe('wbz');
    expect(Object.entries(lineup).filter(([, c]) => c.number !== null).map(([k]) => k)).toEqual(['CBS']);
    // /live-tv/stream/wbz/ stalls (it asks Google's ad server for a 24/7 stream); the local path plays.
    expect(t.watchUrl!.replace('{ref}', 'wbz')).toBe('https://www.paramountplus.com/live-tv/stream/local/wbz/');
    expect(createAdapter('paramount-plus').onChannel('https://www.paramountplus.com/live-tv/stream/local/wbz/?x=1', ch('wbz'))).toBe(true);
    expect(createAdapter('paramount-plus').onChannel('https://www.paramountplus.com/live-tv/stream/local/wcbs/', ch('wbz'))).toBe(false);
  });
});

describe('ESPN web player', () => {
  it('a fixed lineup of ?network= ids that the network matcher recognises', () => {
    const t = url('espn');
    if (t.lineup.mode !== 'static') throw new Error('expected a fixed lineup');
    const lineup = matchLineup(t.lineup.channels.map((c) => ({ label: c.label, number: null, callSign: null, ref: c.ref })));
    expect(Object.fromEntries(Object.entries(lineup).filter(([, e]) => e.number !== null).map(([k, e]) => [k, e.ref]))).toEqual({ ESPN: 'espn', ESPN2: 'espn2', ESPNU: 'espnu', ESPNews: 'espnews', 'SEC Network': 'sec', 'ACC Network': 'acc' });
    expect(createAdapter('espn').onChannel('https://www.espn.com/watch/player?network=espn2', ch('espn2'))).toBe(true);
    expect(compileRegex(loadProviderConfig('espn').errors.loginText).test('Choose your TV provider')).toBe(true);
  });
});
