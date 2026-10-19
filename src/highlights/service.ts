import type { Config } from '../config';
import type { GameSnapshot } from '../engine/types';
import { EspnClient } from '../espn/client';
import { sportOf } from '../sports';
import { parseEspnVideos, type EspnClip } from './espn';
import { buildReel, type ReelItem } from './reel';
import type { YouTubeClient, YouTubeClip } from './youtube';

// Keeps today's highlight clips fresh enough for a halftime reel.
//  - Clips arrive for free whenever the live poller fetches a game's summary (home and on-screen games).
//  - When a reel is needed, other games' summaries are fetched politely (one every ~0.6 s; live games
//    refreshed after 3 min, finished games after an hour).
//  - YouTube is searched only for finished games, through the quota-guarded client.

const LIVE_TTL = 3 * 60_000;
const FINAL_TTL = 60 * 60_000;

export class HighlightService {
  private clips = new Map<string, { clips: EspnClip[]; fetchedAt: number }>();
  private youtubeClips = new Map<string, YouTubeClip>();
  private finalSeen = new Map<string, number>();
  private refreshing: Promise<void> | null = null;
  private lastRefresh = 0;
  private client: EspnClient;

  constructor(
    private cfg: Config,
    private readonly youtube: YouTubeClient | null,
    private readonly info: (text: string) => void,
  ) {
    this.client = new EspnClient(cfg.espn);
  }

  setConfig(cfg: Config): void {
    this.cfg = cfg;
  }

  get youtubeEnabled(): boolean {
    return this.youtube !== null && this.cfg.highlights.youtube;
  }

  /** Free clips from summaries the app fetched anyway. */
  ingestSummary(gameId: string, body: unknown, at: number): void {
    this.clips.set(gameId, { clips: parseEspnVideos(body, gameId, at), fetchedAt: at });
  }

  noteGames(games: GameSnapshot[], now: number): void {
    for (const g of games) if (g.phase === 'FINAL' && !this.finalSeen.has(g.id)) this.finalSeen.set(g.id, now);
  }

  clipCount(): number {
    let n = 0;
    for (const v of this.clips.values()) n += v.clips.length;
    return n;
  }

  reel(homeGameId: string | null, games: GameSnapshot[], now: number): ReelItem[] {
    if (now - this.lastRefresh > 120_000) void this.refresh(games, homeGameId, now);
    const clips = new Map([...this.clips].map(([id, v]) => [id, v.clips]));
    return buildReel({ homeGameId, games, clips, youtube: this.youtubeClips, now, opts: this.cfg.highlights });
  }

  /** Fetch what's missing or stale, most useful games first. Only one refresh runs at a time. */
  refresh(games: GameSnapshot[], homeGameId: string | null, now = Date.now()): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.lastRefresh = now;
    this.refreshing = this.doRefresh(games, homeGameId, now).finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(games: GameSnapshot[], homeGameId: string | null, now: number): Promise<void> {
    const h = this.cfg.highlights;
    const margin = (g: GameSnapshot) => Math.abs(g.home.score - g.away.score);
    const home = games.filter((g) => g.id === homeGameId);
    // Same sport as the home game first (its reel is mostly that sport), then the others.
    const homeSport = home[0]?.sport;
    const order = (a: GameSnapshot, b: GameSnapshot) => Number(a.sport !== homeSport) - Number(b.sport !== homeSport) || margin(a) - margin(b);
    const live = games.filter((g) => g.id !== homeGameId && (g.phase === 'LIVE' || g.phase === 'HALFTIME')).sort(order);
    const finals = games.filter((g) => g.id !== homeGameId && g.phase === 'FINAL').sort(order);
    let fetched = 0;
    if (h.espnClips) {
      for (const g of [...home, ...live, ...finals].slice(0, h.maxGamesPerRefresh)) {
        const have = this.clips.get(g.id);
        const ttl = g.phase === 'FINAL' ? FINAL_TTL : LIVE_TTL;
        if (have && Date.now() - have.fetchedAt < ttl) continue;
        try {
          const res = await this.client.summary(g.id, sportOf(g.sport).espn);
          this.ingestSummary(g.id, res.body, Date.parse(res.fetchedAt));
          fetched++;
        } catch {
          // skip this game this round
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    let found = 0;
    if (this.youtube && h.youtube) {
      for (const g of finals.slice(0, 8)) {
        if (this.youtubeClips.has(g.id)) continue;
        const names = (team: GameSnapshot['home'], full: string) => [team.name, team.abbr, full, full.split(' ').slice(0, -1).join(' ')].filter(Boolean);
        const [awayFull = '', homeFull = ''] = g.name.split(' at ');
        const clip = await this.youtube.findHighlights({ id: g.id, league: sportOf(g.sport).highlights?.query, name: g.name, awayNames: names(g.away, awayFull), homeNames: names(g.home, homeFull), finalSeenAt: this.finalSeen.get(g.id) ?? now }, Date.now());
        if (clip) {
          this.youtubeClips.set(g.id, clip);
          found++;
        }
      }
    }
    if (fetched || found) this.info(`highlights: refreshed ${fetched} game(s)${this.youtube ? `, ${found} YouTube package(s) found (${this.youtube.searchesToday} searches today)` : ''}; ${this.clipCount()} ESPN clips cached`);
  }
}
