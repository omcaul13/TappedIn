import { describe, expect, it } from 'vitest';
import { HighlightService } from '../src/highlights/service';
import type { YouTubeClient } from '../src/highlights/youtube';
import { snap, T0, testConfig } from './helpers';

describe('highlight refresh errors', () => {
  it('a failing refresh is logged, never rejected (callers fire and forget it)', async () => {
    // e.g. the YouTube cache file can't be written (EBUSY/EPERM on Windows)
    const youtube = { searchesToday: 0, findHighlights: async () => Promise.reject(new Error('EBUSY: youtube-cache.json')) } as unknown as YouTubeClient;
    const lines: string[] = [];
    const svc = new HighlightService(testConfig({ highlights: { espnClips: false, youtube: true } }), youtube, (t) => void lines.push(t));
    await expect(svc.refresh([snap({ id: 'done', phase: 'FINAL' })], null, T0)).resolves.toBeUndefined();
    expect(lines.join('\n')).toMatch(/EBUSY/);
  });
});
