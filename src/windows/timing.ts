// Switch timelines: where the time goes between "the director decided" and "video is playing".

export interface SwitchTiming {
  screen: number;
  gameId: string;
  channel: number;
  channelName: string;
  /** How the tile got there: in-app guide click, cached URL page load, full guide load, view swap… */
  path: string | null;
  commandedAt: number;
  navStartAt: number | null;
  /** The page is on the new channel's live URL. */
  navCommittedAt: number | null;
  /** A new video element/source has a frame (readyState >= 2). */
  firstFrameAt: number | null;
  /** The new video's currentTime is advancing. */
  playingAt: number | null;
  outcome: 'playing' | 'timeout' | 'superseded' | 'error';
}

export interface StageStats {
  n: number;
  mean: number;
  p50: number;
  p90: number;
}

export function stats(xs: number[]): StageStats | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: s[Math.floor(s.length * 0.5)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] };
}

export const STAGES = [
  ['decision -> command', 'decidedAt', 'commandedAt'],
  ['command -> navigation start', 'commandedAt', 'navStartAt'],
  ['navigation (page on channel)', 'navStartAt', 'navCommittedAt'],
  ['page -> first frame', 'navCommittedAt', 'firstFrameAt'],
  ['first frame -> playing', 'firstFrameAt', 'playingAt'],
  ['TOTAL decision -> playing', 'decidedAt', 'playingAt'],
] as const;

/** Per path, per stage durations in seconds. `decidedAt` comes from the matching director decision. */
export function summarize(timings: (SwitchTiming & { decidedAt?: number | null })[]): Map<string, Map<string, StageStats | null>> {
  const out = new Map<string, Map<string, StageStats | null>>();
  const groups = new Map<string, typeof timings>();
  for (const t of timings) {
    if (t.outcome !== 'playing') continue;
    for (const key of [t.path ?? 'unknown', 'ALL']) groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const [path, ts] of groups) {
    const m = new Map<string, StageStats | null>();
    for (const [label, from, to] of STAGES) {
      const xs = ts.flatMap((t) => {
        const a = t[from];
        const b = t[to];
        return typeof a === 'number' && typeof b === 'number' && b >= a ? [(b - a) / 1000] : [];
      });
      m.set(label, stats(xs));
    }
    out.set(path, m);
  }
  return out;
}
