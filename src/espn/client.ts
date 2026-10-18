// Polite ESPN fetcher: per-request timeout, exponential backoff, Retry-After on 429.
// Endpoints are unofficial; callers must tolerate any field being missing.
import '../systemCa';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export interface EspnClientOptions {
  /** Default league path ('football/college-football') and groups, for callers that don't name one. */
  sport: string;
  groups: string;
  requestTimeoutMs: number;
}

/** One ESPN league endpoint: 'basketball/nba', or 'football/college-football' with groups '80' (FBS). */
export interface League {
  path: string;
  groups?: string;
}

export interface FetchResult<T = unknown> {
  url: string;
  status: number;
  fetchedAt: string;
  body: T;
}

export class EspnHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`ESPN ${status} for ${url}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class EspnClient {
  constructor(private readonly opts: EspnClientOptions) {}

  private league(l?: League): League {
    return l ?? { path: this.opts.sport, groups: this.opts.groups };
  }

  scoreboardUrl(date: string, league?: League): string {
    const l = this.league(league);
    return `${BASE}/${l.path}/scoreboard?dates=${date}${l.groups ? `&groups=${l.groups}` : ''}&limit=300`;
  }

  summaryUrl(eventId: string, league?: League): string {
    return `${BASE}/${this.league(league).path}/summary?event=${eventId}`;
  }

  scoreboard(date: string, league?: League): Promise<FetchResult> {
    return this.getJson(this.scoreboardUrl(date, league));
  }

  summary(eventId: string, league?: League): Promise<FetchResult> {
    return this.getJson(this.summaryUrl(eventId, league));
  }

  async getJson<T = unknown>(url: string, retries = 2): Promise<FetchResult<T>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(this.opts.requestTimeoutMs),
          headers: { accept: 'application/json', 'user-agent': 'redzone-personal/0.1 (personal, low-rate)' },
        });
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'));
          lastErr = new EspnHttpError(url, res.status);
          if (attempt < retries) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
          continue;
        }
        if (!res.ok) throw new EspnHttpError(url, res.status);
        return { url, status: res.status, fetchedAt: new Date().toISOString(), body: (await res.json()) as T };
      } catch (err) {
        if (err instanceof EspnHttpError && err.status < 500 && err.status !== 429) throw err;
        lastErr = err;
        if (attempt < retries) await sleep(1000 * 2 ** attempt);
      }
    }
    throw lastErr;
  }
}

/** ESPN game-day key (YYYYMMDD) in US Eastern time, which is how ESPN buckets the CFB slate. */
export function espnDateKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts.replaceAll('-', '');
}
