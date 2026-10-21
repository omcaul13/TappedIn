import type { StreamState } from './health';

// Pure decisions for the window controller, kept separate so they're unit-tested.

export interface ErrorAdvice {
  /** retry: re-tune now (guide path). fail: show the error, retry later. dataTile: show live data instead of video. */
  action: 'none' | 'retry' | 'fail' | 'dataTile';
  retryAfterSeconds: number | null;
  title: string;
  hint: string;
}

/** What to do about a stream state, given how many times this screen already retried. `shortName` names the service in messages. */
export function adviseOnStream(state: StreamState, attempts: number, retrySeconds: number, shortName = 'Xfinity'): ErrorAdvice {
  const none: ErrorAdvice = { action: 'none', retryAfterSeconds: null, title: '', hint: '' };
  switch (state) {
    case 'PLAYING':
    case 'BUFFERING':
    case 'NO_VIDEO':
    case 'PAUSED':
    case 'IDLE_PROMPT':
      return none;
    case 'STREAM_LIMIT':
      return { action: 'dataTile', retryAfterSeconds: null, title: `${shortName} stream limit reached`, hint: 'Showing live game data on this screen instead. Video returns to the most exciting games.' };
    case 'LOGIN_REQUIRED':
      return { action: 'fail', retryAfterSeconds: retrySeconds * 2, title: `Signed out of ${shortName}`, hint: 'TappedIn signs in again on its own and this screen retries. If it keeps failing, use Settings → TV service (Chrome tiles: run "npm run login").' };
    case 'CHANNEL_UNAVAILABLE':
      return { action: 'fail', retryAfterSeconds: retrySeconds * 5, title: 'Channel not available', hint: shortName === 'Xfinity' ? 'Xfinity says this channel can\'t play here. Live TV needs the campus network; check the channel number in the config.' : `${shortName} says this channel can't play here. It may not be in your plan, or may only play on your home network; check the channel in your lineup.` };
    case 'DRM_ERROR':
      return attempts < 1 ? { ...none, action: 'retry' } : { action: 'fail', retryAfterSeconds: retrySeconds, title: 'Playback protection (Widevine) error', hint: 'Run "npm run doctor" to check Widevine (Chrome tiles: use Google Chrome, not Chromium). Retrying periodically.' };
    case 'STALLED':
    case 'MEDIA_ERROR':
    case 'UNKNOWN_ERROR':
      return attempts < 1 ? { ...none, action: 'retry' } : { action: 'fail', retryAfterSeconds: retrySeconds, title: state === 'STALLED' ? 'Stream stalled' : 'Stream error', hint: 'Retried once already; trying again every ' + retrySeconds + 's. Use the guide in this window if it persists.' };
  }
}

/**
 * Which screens get real video when the service allows fewer streams than screens. The most exciting
 * screens win; screens that already have video get a bonus so the allocation doesn't flap.
 */
export function allocateVideo(screens: { id: number; wantsVideo: boolean; excitement: number }[], limit: number, current: ReadonlySet<number>, stickiness = 15): Set<number> {
  const wanting = screens.filter((s) => s.wantsVideo);
  if (wanting.length <= limit) return new Set(wanting.map((s) => s.id));
  const ranked = [...wanting].sort((a, b) => b.excitement + (current.has(b.id) ? stickiness : 0) - (a.excitement + (current.has(a.id) ? stickiness : 0)) || a.id - b.id);
  return new Set(ranked.slice(0, Math.max(0, limit)).map((s) => s.id));
}
