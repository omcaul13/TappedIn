import type { StreamState } from './health';

// Pure decisions for the window controller, kept separate so they're unit-tested.

export interface ErrorAdvice {
  /** retry: re-tune now (guide path). fail: show the error, retry later. dataTile: show live data instead of video. */
  action: 'none' | 'retry' | 'fail' | 'dataTile';
  retryAfterSeconds: number | null;
  title: string;
  hint: string;
}

/** What to do about a stream state, given how many times this screen already retried. */
export function adviseOnStream(state: StreamState, attempts: number, retrySeconds: number): ErrorAdvice {
  const none: ErrorAdvice = { action: 'none', retryAfterSeconds: null, title: '', hint: '' };
  switch (state) {
    case 'PLAYING':
    case 'BUFFERING':
    case 'NO_VIDEO':
    case 'PAUSED':
    case 'IDLE_PROMPT':
      return none;
    case 'STREAM_LIMIT':
      return { action: 'dataTile', retryAfterSeconds: null, title: 'Xfinity stream limit reached', hint: 'Showing live game data on this screen instead. Video returns to the most exciting games.' };
    case 'LOGIN_REQUIRED':
      return { action: 'fail', retryAfterSeconds: retrySeconds * 2, title: 'Signed out of Xfinity', hint: 'Run "npm run login" and sign in again; this screen retries on its own.' };
    case 'CHANNEL_UNAVAILABLE':
      return { action: 'fail', retryAfterSeconds: retrySeconds * 5, title: 'Channel not available', hint: 'Xfinity says this channel can\'t play here. Live TV needs the campus network; check the channel number in the config.' };
    case 'DRM_ERROR':
      return attempts < 1 ? { ...none, action: 'retry' } : { action: 'fail', retryAfterSeconds: retrySeconds, title: 'Playback protection (Widevine) error', hint: 'Make sure this is Google Chrome (not Chromium) and up to date. Retrying periodically.' };
    case 'STALLED':
    case 'MEDIA_ERROR':
    case 'UNKNOWN_ERROR':
      return attempts < 1 ? { ...none, action: 'retry' } : { action: 'fail', retryAfterSeconds: retrySeconds, title: state === 'STALLED' ? 'Stream stalled' : 'Stream error', hint: 'Retried once already; trying again every ' + retrySeconds + 's. Use the guide in this window if it persists.' };
  }
}

/**
 * Which screens get real video when Xfinity allows fewer streams than screens. The most exciting
 * screens win; screens that already have video get a bonus so the allocation doesn't flap.
 */
export function allocateVideo(screens: { id: number; wantsVideo: boolean; excitement: number }[], limit: number, current: ReadonlySet<number>, stickiness = 15): Set<number> {
  const wanting = screens.filter((s) => s.wantsVideo);
  if (wanting.length <= limit) return new Set(wanting.map((s) => s.id));
  const ranked = [...wanting].sort((a, b) => b.excitement + (current.has(b.id) ? stickiness : 0) - (a.excitement + (current.has(a.id) ? stickiness : 0)) || a.id - b.id);
  return new Set(ranked.slice(0, Math.max(0, limit)).map((s) => s.id));
}
