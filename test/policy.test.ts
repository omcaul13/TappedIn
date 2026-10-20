import { describe, expect, it } from 'vitest';
import { HealthTracker, type FrameProbe, type VideoProbe } from '../src/windows/health';
import { adviseOnStream, allocateVideo } from '../src/windows/policy';

describe('stream error advice', () => {
  it('healthy or starting states need nothing', () => {
    for (const s of ['PLAYING', 'BUFFERING', 'NO_VIDEO', 'PAUSED', 'IDLE_PROMPT'] as const) expect(adviseOnStream(s, 0, 60).action).toBe('none');
  });

  it('stalls and unknown errors: one quick retry, then a visible error that keeps retrying', () => {
    expect(adviseOnStream('STALLED', 0, 60).action).toBe('retry');
    const second = adviseOnStream('STALLED', 1, 60);
    expect(second).toMatchObject({ action: 'fail', retryAfterSeconds: 60, title: 'Stream stalled' });
    expect(adviseOnStream('UNKNOWN_ERROR', 1, 60).action).toBe('fail');
  });

  it('sign-out and unavailable channels fail straight away with a fix', () => {
    expect(adviseOnStream('LOGIN_REQUIRED', 0, 60)).toMatchObject({ action: 'fail', retryAfterSeconds: 120 });
    expect(adviseOnStream('LOGIN_REQUIRED', 0, 60).hint).toMatch(/Settings → TV service/);
    expect(adviseOnStream('CHANNEL_UNAVAILABLE', 0, 60)).toMatchObject({ action: 'fail', retryAfterSeconds: 300 });
  });

  it('a stream limit switches the screen to live data instead of failing', () => {
    expect(adviseOnStream('STREAM_LIMIT', 0, 60).action).toBe('dataTile');
  });
});

describe('video allocation under a stream limit', () => {
  const screens = [
    { id: 1, wantsVideo: true, excitement: 10 },
    { id: 2, wantsVideo: true, excitement: 120 }, // red zone
    { id: 3, wantsVideo: true, excitement: 40 },
    { id: 4, wantsVideo: false, excitement: 0 }, // halftime reel
  ];

  it('everyone gets video when under the limit', () => {
    expect([...allocateVideo(screens, 4, new Set())].sort()).toEqual([1, 2, 3]);
    expect([...allocateVideo(screens, 3, new Set())].sort()).toEqual([1, 2, 3]);
  });

  it('the most exciting screens win', () => {
    expect([...allocateVideo(screens, 2, new Set())].sort()).toEqual([2, 3]);
  });

  it('current holders keep video unless clearly beaten (no flapping)', () => {
    const close = [
      { id: 1, wantsVideo: true, excitement: 30 },
      { id: 2, wantsVideo: true, excitement: 40 },
    ];
    expect([...allocateVideo(close, 1, new Set([1]))]).toEqual([1]); // 30 + 15 stickiness > 40
    expect([...allocateVideo([{ ...close[0] }, { id: 2, wantsVideo: true, excitement: 60 }], 1, new Set([1]))]).toEqual([2]);
  });
});

describe('health tracker timeouts', () => {
  const frame = (v: Partial<VideoProbe> | null): FrameProbe => ({
    url: 'https://www.xfinity.com/stream/live/x/1/ESPND', title: '', isTop: true, webdriver: false, visibility: 'visible', fullscreen: false,
    viewport: { w: 754, h: 419 }, largestVideoAncestors: [], errorMatches: [], errorLines: [],
    videos: v ? [{ rect: { x: 0, y: 0, w: 754, h: 419 }, videoW: 960, videoH: 540, currentTime: 0, readyState: 4, paused: false, ended: false, muted: true, volume: 1, hasMediaKeys: true, error: null, src: 'blob:a', ...v }] : [],
  });

  it('gives a new stream the startup timeout, then uses the shorter stall timeout', () => {
    const t = new HealthTracker({ startupSeconds: 25, stallSeconds: 12 });
    const t0 = 1_000_000;
    t.reset(t0);
    expect(t.update([frame(null)], t0 + 20_000).state).toBe('NO_VIDEO');
    expect(t.update([frame(null)], t0 + 26_000).state).toBe('STALLED');
    t.reset(t0);
    t.update([frame({ currentTime: 10 })], t0 + 1000);
    expect(t.update([frame({ currentTime: 12 })], t0 + 3000).state).toBe('PLAYING');
    expect(t.hasPlayed).toBe(true);
    expect(t.update([frame({ currentTime: 12 })], t0 + 10_000).state).toBe('BUFFERING');
    expect(t.update([frame({ currentTime: 12 })], t0 + 16_000).state).toBe('STALLED');
  });

  it('recognises Xfinity error text and the still-watching prompt (only when not playing)', () => {
    const t = new HealthTracker(12);
    const withText = (line: string): FrameProbe => ({ ...frame(null), errorLines: [line] });
    expect(t.update([withText('You have reached the maximum number of devices streaming')]).state).toBe('STREAM_LIMIT');
    expect(t.update([withText('Are you still watching?')]).state).toBe('IDLE_PROMPT');
    expect(t.update([withText('This channel is not available in your area')]).state).toBe('CHANNEL_UNAVAILABLE');
  });
});
