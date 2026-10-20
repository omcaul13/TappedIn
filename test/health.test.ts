import { describe, expect, it } from 'vitest';
import { loadProviderConfig } from '../src/providers/registry';
import { DEFAULT_RULES, errorRules, HealthTracker, type FrameProbe, type VideoProbe } from '../src/windows/health';
import { adviseOnStream } from '../src/windows/policy';

const frame = (v: Partial<VideoProbe> | null, extra: Partial<FrameProbe> = {}): FrameProbe => ({
  url: 'https://www.xfinity.com/stream/live/x/1/ESPND', title: '', isTop: true, webdriver: false, visibility: 'visible', fullscreen: false,
  viewport: { w: 754, h: 419 }, largestVideoAncestors: [], errorMatches: [], errorLines: [],
  videos: v ? [{ rect: { x: 0, y: 0, w: 754, h: 419 }, videoW: 960, videoH: 540, currentTime: 0, readyState: 4, paused: false, ended: false, muted: true, volume: 1, hasMediaKeys: true, error: null, src: 'blob:a', ...v }] : [],
  ...extra,
});
const withText = (line: string): FrameProbe => frame(null, { errorLines: [line] });

describe('config-driven error rules', () => {
  it('the built-in defaults are exactly the Xfinity On Campus rules', () => {
    const xoc = errorRules(loadProviderConfig('xfinity-on-campus'));
    expect(xoc.probePatterns).toEqual(DEFAULT_RULES.probePatterns);
    for (const k of ['loginUrl', 'limit', 'unavailable', 'loginText', 'idlePrompt'] as const) {
      expect(xoc[k].source).toBe(DEFAULT_RULES[k].source);
      expect(xoc[k].flags).toBe(DEFAULT_RULES[k].flags);
    }
  });

  it('default rules classify like before', () => {
    const t = new HealthTracker(12);
    expect(t.update([frame(null, { url: 'https://login.microsoftonline.com/common/oauth2' })]).state).toBe('LOGIN_REQUIRED');
    expect(t.update([withText('You have reached the maximum number of devices')]).state).toBe('STREAM_LIMIT');
    expect(t.update([withText('This channel is not available in your area')]).state).toBe('CHANNEL_UNAVAILABLE');
    expect(t.update([withText('Are you still watching?')]).state).toBe('IDLE_PROMPT');
    expect(t.update([frame({ error: { code: 3, message: 'Failed to acquire a license' } })]).state).toBe('DRM_ERROR');
  });

  it('a provider can bring its own stream-limit text', () => {
    const rules = { ...DEFAULT_RULES, limit: /streams are in use/i };
    const t = new HealthTracker(12, rules);
    expect(t.update([withText('All your streams are in use')]).state).toBe('STREAM_LIMIT');
    expect(new HealthTracker(12).update([withText('All your streams are in use')]).state).not.toBe('STREAM_LIMIT');
  });
});

describe('messages name the service', () => {
  it('defaults to Xfinity, exactly as before', () => {
    expect(adviseOnStream('STREAM_LIMIT', 0, 60).title).toBe('Xfinity stream limit reached');
    expect(adviseOnStream('LOGIN_REQUIRED', 0, 60).title).toBe('Signed out of Xfinity');
    expect(adviseOnStream('CHANNEL_UNAVAILABLE', 0, 60).hint).toMatch(/campus network/);
  });

  it('uses the provider short name', () => {
    expect(adviseOnStream('LOGIN_REQUIRED', 0, 60, 'Spectrum').title).toBe('Signed out of Spectrum');
    expect(adviseOnStream('STREAM_LIMIT', 0, 60, 'Sling').title).toBe('Sling stream limit reached');
    expect(adviseOnStream('CHANNEL_UNAVAILABLE', 0, 60, 'Sling').hint).not.toMatch(/campus network/);
  });
});

describe('stall detection', () => {
  it('a playing video checked less often than every 4 s still reads as playing', () => {
    // Health checks don't overlap, so a slow round (busy pages) can space one screen's checks 6 s apart.
    const t = new HealthTracker({ startupSeconds: 25, stallSeconds: 12 });
    t.reset(0);
    const states = [0, 6000, 12000, 18000, 24000, 30000].map((now) => t.update([frame({ currentTime: now / 1000 })], now).state);
    expect(states.slice(1)).toEqual(['PLAYING', 'PLAYING', 'PLAYING', 'PLAYING', 'PLAYING']);
  });

  it('a frozen video checked 6 s apart is still a stall', () => {
    const t = new HealthTracker({ startupSeconds: 25, stallSeconds: 12 });
    t.reset(0);
    t.update([frame({ currentTime: 0 })], 0);
    t.update([frame({ currentTime: 6 })], 6000);
    const states = [12000, 18000, 24000].map((now) => t.update([frame({ currentTime: 6 })], now).state);
    expect(states).toEqual(['BUFFERING', 'STALLED', 'STALLED']);
  });
});
