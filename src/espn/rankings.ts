import type { SportId } from '../engine/types';
import { sportOf } from '../sports';
import type { EspnClient } from './client';
import type { Json } from './json';

// World rankings for sports whose scoreboard doesn't carry them (tennis: it has only tournament seeds).
// Fetched once per sport per day and attached to each scoreboard body as `tappedinRanks` (athlete id →
// rank), with the day asked for as `tappedinDay` (a dated tennis scoreboard has no `day` of its own), so
// recordings carry both and replays see the same thing.

const RANKED: ReadonlySet<SportId> = new Set(['atp', 'wta']);
const RETRY_MS = 10 * 60_000;

export function rankMap(body: Json): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of body?.rankings?.[0]?.ranks ?? []) {
    const id = r?.athlete?.id;
    const rank = Number(r?.current);
    if (id != null && Number.isFinite(rank)) out[String(id)] = rank;
  }
  return out;
}

export class RankCache {
  private cache = new Map<SportId, { day: string; ranks: Record<string, number> }>();
  private failedAt = new Map<SportId, number>();

  constructor(
    private readonly client: EspnClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** The sport's rankings (empty for sports without, or when ESPN fails: seeds still work). */
  async get(sport: SportId, day: string): Promise<Record<string, number>> {
    if (!RANKED.has(sport)) return {};
    const hit = this.cache.get(sport);
    if (hit?.day === day) return hit.ranks;
    // After a failure, wait before asking again: every scoreboard poll waits on this.
    if (this.now() - (this.failedAt.get(sport) ?? -Infinity) < RETRY_MS) return hit?.ranks ?? {};
    try {
      const ranks = rankMap((await this.client.getJson(this.client.rankingsUrl(sportOf(sport).espn))).body);
      this.cache.set(sport, { day, ranks });
      this.failedAt.delete(sport);
      return ranks;
    } catch {
      this.failedAt.set(sport, this.now());
      return hit?.ranks ?? {}; // yesterday's (or none) until a retry works
    }
  }

  /** Attach rankings and the day (YYYYMMDD) to a scoreboard body (no-op for sports without). */
  async attach(sport: SportId, day: string, body: unknown): Promise<void> {
    if (!RANKED.has(sport) || !body || typeof body !== 'object') return;
    const b = body as Json;
    b.tappedinRanks = await this.get(sport, day);
    if (/^\d{8}$/.test(day)) b.tappedinDay = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  }
}

/** What of a scoreboard response gets recorded (tennis: today's singles only). */
export function recordableScoreboard(sport: SportId, body: unknown): unknown {
  return sportOf(sport).trimScoreboard?.(body) ?? body;
}
