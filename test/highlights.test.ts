import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyClip, parseEspnVideos, type EspnClip } from '../src/highlights/espn';
import { buildReel } from '../src/highlights/reel';
import { HighlightService } from '../src/highlights/service';
import { matchesGame, YouTubeClient, type SearchGame } from '../src/highlights/youtube';
import { fixture, snap, T0, testConfig } from './helpers';

const opts = testConfig().highlights;

describe('ESPN clips', () => {
  // Real videos[] from RUTG @ MD, 10/17/2026: one "Full Highlights" package + 12 plays.
  const fx = fixture('videos-sample.json');
  const clips = parseEspnVideos(fx, fx.eventId, Date.parse('2026-10-18T06:00:00Z'));

  it('parses playable MP4s with headline, duration and publish time', () => {
    expect(clips).toHaveLength(13);
    for (const c of clips) {
      expect(c.mp4).toMatch(/^https:\/\/.+\.mp4$/);
      expect(c.durationSec).toBeGreaterThan(0);
      expect(c.publishedAt).toBeGreaterThan(0);
    }
  });

  it('tells packages, plays and talk apart', () => {
    expect(clips.filter((c) => c.kind === 'package').map((c) => c.headline)).toEqual(['Rutgers Scarlet Knights vs. Maryland Terrapins: Full Highlights']);
    expect(clips.filter((c) => c.kind === 'play')).toHaveLength(12);
    expect(classifyClip("Ryan Day estimates Julian Sayin out for 'several weeks'", 37)).toBe('talk');
    expect(classifyClip('Coach reacts after the win', 95)).toBe('talk');
    expect(classifyClip('Jamare Glasker picks off Rutgers Scarlet Knights', 18)).toBe('play');
  });

  it('skips embargoed, desktop-blocked and non-MP4 videos', () => {
    const v = (extra: object) => ({ id: 1, headline: 'TD run', duration: 20, links: { source: { href: 'https://x/a.mp4' } }, ...extra });
    expect(parseEspnVideos({ videos: [v({ timeRestrictions: { embargoDate: new Date(T0 + 60_000).toISOString() } })] }, 'g', T0)).toEqual([]);
    expect(parseEspnVideos({ videos: [v({ deviceRestrictions: { type: 'whitelist', devices: ['handset'] } })] }, 'g', T0)).toEqual([]);
    expect(parseEspnVideos({ videos: [v({ links: { source: { href: 'https://x/a.m3u8' } } })] }, 'g', T0)).toEqual([]);
    expect(parseEspnVideos({ videos: 'nope' }, 'g', T0)).toEqual([]);
  });
});

describe('halftime reel order', () => {
  const clip = (gameId: string, id: string, kind: EspnClip['kind'], minsAgo: number, durationSec = 20): EspnClip => ({
    id, gameId, headline: `${gameId} ${id}`, durationSec, mp4: `https://x/${id}.mp4`, thumbnail: null, publishedAt: T0 - minsAgo * 60_000, kind,
  });
  const score = (h: number, a: number) => ({ home: { id: 'h', abbr: 'H', name: 'H', score: h }, away: { id: 'a', abbr: 'A', name: 'A', score: a } });
  const games = [
    snap({ id: 'home', phase: 'HALFTIME', ...score(14, 10) }),
    snap({ id: 'close', phase: 'LIVE', ...score(21, 20) }),
    snap({ id: 'blowout', phase: 'LIVE', ...score(42, 0) }),
    snap({ id: 'final1', phase: 'FINAL', ...score(30, 3) }),
    snap({ id: 'final2', phase: 'FINAL', ...score(24, 21) }),
  ];
  const clips = new Map<string, EspnClip[]>([
    ['home', [clip('home', 'h2', 'play', 10), clip('home', 'h1', 'play', 40), clip('home', 'talk', 'talk', 5)]],
    ['close', [clip('close', 'c1', 'play', 30), clip('close', 'c2', 'play', 5), clip('close', 'old', 'play', 200)]],
    ['blowout', [clip('blowout', 'b1', 'play', 8)]],
    ['final1', [clip('final1', 'f1a', 'play', 90), clip('final1', 'f1b', 'play', 60)]],
    ['final2', [clip('final2', 'pkg', 'package', 50, 120), clip('final2', 'f2a', 'play', 70)]],
  ]);
  const ids = (items: ReturnType<typeof buildReel>) => items.map((i) => (i.kind === 'card' ? 'CARD' : i.id.replace(/^(espn|yt)-/, '')));

  it('home first half in order, then other live games round-robin (closest first, recent only), then finals', () => {
    const reel = buildReel({ homeGameId: 'home', games, clips, youtube: new Map(), now: T0, opts: { ...opts, cardEveryClips: 100 } });
    expect(ids(reel)).toEqual(['h1', 'h2', 'c2', 'b1', 'c1', 'pkg', 'f1a', 'f1b']);
  });

  it('a YouTube package replaces ESPN clips for a finished game', () => {
    const youtube = new Map([['final1', { videoId: 'YT1', title: 'Highlights', channelTitle: 'ESPN College Football', publishedAt: '', gameId: 'final1' }]]);
    const reel = buildReel({ homeGameId: 'home', games, clips, youtube, now: T0, opts: { ...opts, cardEveryClips: 100 } });
    expect(ids(reel).slice(-2)).toEqual(['pkg', 'YT1']);
    expect(reel.at(-1)).toMatchObject({ kind: 'youtube', videoId: 'YT1' });
  });

  it('a scores card every few clips; only a card when there is nothing', () => {
    const reel = buildReel({ homeGameId: 'home', games, clips, youtube: new Map(), now: T0, opts: { ...opts, cardEveryClips: 3 } });
    expect(ids(reel)).toEqual(['h1', 'h2', 'c2', 'CARD', 'b1', 'c1', 'pkg', 'CARD', 'f1a', 'f1b']);
    expect(ids(buildReel({ homeGameId: null, games, clips: new Map(), youtube: new Map(), now: T0, opts }))).toEqual(['CARD']);
  });
});

describe('YouTube', () => {
  const game: SearchGame = { id: 'g1', name: 'Rutgers Scarlet Knights at Maryland Terrapins', awayNames: ['Rutgers', 'RUTG'], homeNames: ['Maryland', 'MD'], finalSeenAt: T0 - 3600_000 };
  const channels = testConfig().highlights.youtubeChannels;

  it('only accepts official channels whose title names both teams', () => {
    expect(matchesGame({ title: 'Rutgers vs. Maryland | Full Game Highlights', channelTitle: 'Big Ten Network' }, game, channels)).toBe(true);
    expect(matchesGame({ title: 'Rutgers vs. Maryland HIGHLIGHTS', channelTitle: 'Random Fan Edits' }, game, channels)).toBe(false);
    expect(matchesGame({ title: 'Rutgers vs. Ohio State Highlights', channelTitle: 'Big Ten Network' }, game, channels)).toBe(false);
  });

  it('searches once per game, caches the result, and respects the daily cap', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ items: [{ id: { videoId: 'abc' }, snippet: { title: 'Rutgers vs. Maryland Highlights', channelTitle: 'Big Ten Network', publishedAt: '2026-10-17T22:00:00Z' } }] }));
    }) as typeof fetch;
    const dir = mkdtempSync(path.join(os.tmpdir(), 'rz-yt-'));
    const yt = new YouTubeClient({ apiKey: 'k', channels, maxSearchesPerDay: 1, minMinutesAfterFinal: 20, cacheFile: path.join(dir, 'c.json'), fetchImpl });
    expect((await yt.findHighlights(game, T0))?.videoId).toBe('abc');
    expect((await yt.findHighlights(game, T0 + 1000))?.videoId).toBe('abc');
    expect(calls).toBe(1);
    expect(await yt.findHighlights({ ...game, id: 'g2' }, T0)).toBeNull(); // daily cap of 1 reached
    expect(calls).toBe(1);
    const tooSoon = new YouTubeClient({ apiKey: 'k', channels, maxSearchesPerDay: 5, minMinutesAfterFinal: 20, cacheFile: path.join(dir, 'd.json'), fetchImpl });
    expect(await tooSoon.findHighlights({ ...game, finalSeenAt: T0 - 60_000 }, T0)).toBeNull();
    expect(calls).toBe(1);
  });
});

describe('reel with several sports', () => {
  const clip = (gameId: string): EspnClip => ({ id: gameId, gameId, headline: `${gameId} goal`, durationSec: 20, mp4: `https://x/${gameId}.mp4`, thumbnail: null, publishedAt: T0 - 60_000, kind: 'play' });
  it("plays the home game's sport first, then other sports (closest first within each)", () => {
    const games = [
      snap({ id: 'home', sport: 'nhl', phase: 'HALFTIME' }),
      snap({ id: 'cfbClose', sport: 'cfb', phase: 'LIVE', home: { id: 'h', abbr: 'H', name: 'H', score: 21 }, away: { id: 'a', abbr: 'A', name: 'A', score: 21 } }),
      snap({ id: 'nhlWide', sport: 'nhl', phase: 'LIVE', home: { id: 'h', abbr: 'H', name: 'H', score: 5 }, away: { id: 'a', abbr: 'A', name: 'A', score: 0 } }),
    ];
    const clips = new Map(games.slice(1).map((g) => [g.id, [clip(g.id)]]));
    const reel = buildReel({ homeGameId: 'home', games, clips, youtube: new Map(), now: T0, opts: { ...opts, cardEveryClips: 100 } });
    expect(reel.map((i) => (i.kind === 'card' ? 'CARD' : i.gameId))).toEqual(['nhlWide', 'cfbClose']);
  });
});

describe('highlight refresh', () => {
  it("never asks ESPN for a tennis match's summary (tennis has none: HTTP 400)", async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ videos: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    try {
      const svc = new HighlightService(testConfig(), null, () => {});
      const games = [snap({ id: 'home', phase: 'HALFTIME' }), snap({ id: 'wta-185570', sport: 'wta', phase: 'LIVE' }), snap({ id: 'cfbFinal', phase: 'FINAL' })];
      await svc.refresh(games, 'home', T0);
      expect(urls.some((u) => u.includes('wta-185570'))).toBe(false);
      expect(urls.filter((u) => /event=(home|cfbFinal)$/.test(u))).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
