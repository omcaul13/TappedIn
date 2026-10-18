import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import '../systemCa';

// Official full-game highlight packages from YouTube (Data API v3, your key in YT_API_KEY).
// Each search costs 100 quota units (default daily quota 10,000), so: finished games only, one search
// per game (cached on disk for the day; one retry later if nothing official was up yet), and a daily
// cap. Results must come from an allowlisted official channel and name both teams in the title;
// they play through YouTube's embeddable player (error 101/150 = embedding off, skipped).

export interface YouTubeClip {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  gameId: string;
}

export interface YouTubeOptions {
  apiKey: string;
  channels: string[];
  maxSearchesPerDay: number;
  cacheFile: string;
  /** Don't search until this long after the final (official uploads take a while). */
  minMinutesAfterFinal: number;
  fetchImpl?: typeof fetch;
}

interface Cache {
  day: string;
  searches: number;
  games: Record<string, { clip: YouTubeClip | null; searchedAt: number; tries: number }>;
}

export interface SearchGame {
  /** Words after "highlights" in the search (the league: "NBA"); none for college football. */
  league?: string;
  id: string;
  /** e.g. "Florida State Seminoles at Miami Hurricanes" */
  name: string;
  awayNames: string[];
  homeNames: string[];
  finalSeenAt: number;
}

const dayKey = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t);

/** Does a result look like the official package for this game? */
export function matchesGame(item: { title: string; channelTitle: string }, game: SearchGame, channels: string[]): boolean {
  const ch = item.channelTitle.toLowerCase();
  if (!channels.some((c) => ch.includes(c.toLowerCase()))) return false;
  const t = item.title.toLowerCase();
  const has = (names: string[]) => names.some((n) => n.length >= 3 && new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  return has(game.awayNames) && has(game.homeNames) && /highlights?/.test(t);
}

export class YouTubeClient {
  private cache: Cache;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: YouTubeOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    try {
      this.cache = JSON.parse(readFileSync(opts.cacheFile, 'utf8'));
    } catch {
      this.cache = { day: '', searches: 0, games: {} };
    }
  }

  /** Cached result, if any (never searches). */
  cached(gameId: string): YouTubeClip | null {
    return this.cache.games[gameId]?.clip ?? null;
  }

  get searchesToday(): number {
    return this.cache.day === dayKey(Date.now()) ? this.cache.searches : 0;
  }

  async findHighlights(game: SearchGame, now = Date.now()): Promise<YouTubeClip | null> {
    const today = dayKey(now);
    if (this.cache.day !== today) this.cache = { day: today, searches: 0, games: {} };
    const prev = this.cache.games[game.id];
    if (prev?.clip) return prev.clip;
    if (now - game.finalSeenAt < this.opts.minMinutesAfterFinal * 60_000) return null;
    if (prev && (prev.tries >= 2 || now - prev.searchedAt < 30 * 60_000)) return null;
    if (this.cache.searches >= this.opts.maxSearchesPerDay) return null;

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: '8',
      q: `${game.name.replace(/ at /, ' vs ')} highlights${game.league ? ` ${game.league}` : ''}`,
      publishedAfter: new Date(game.finalSeenAt - 6 * 3600_000).toISOString(),
      key: this.opts.apiKey,
    });
    this.cache.searches++;
    let clip: YouTubeClip | null = null;
    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const body = (await res.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[] };
        for (const it of body.items ?? []) {
          const s = { title: decode(it.snippet?.title ?? ''), channelTitle: it.snippet?.channelTitle ?? '' };
          if (it.id?.videoId && matchesGame(s, game, this.opts.channels)) {
            clip = { videoId: it.id.videoId, title: s.title, channelTitle: s.channelTitle, publishedAt: it.snippet?.publishedAt ?? '', gameId: game.id };
            break;
          }
        }
      }
    } catch {
      // network hiccup: counts as a try, retried later
    }
    this.cache.games[game.id] = { clip, searchedAt: now, tries: (prev?.tries ?? 0) + 1 };
    this.save();
    return clip;
  }

  private save(): void {
    mkdirSync(path.dirname(this.opts.cacheFile), { recursive: true });
    writeFileSync(this.opts.cacheFile, JSON.stringify(this.cache, null, 2));
  }
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
