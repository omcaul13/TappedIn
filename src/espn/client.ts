// Polite ESPN fetcher: per-request timeout, exponential backoff, Retry-After on 429.
// Endpoints are unofficial; callers must tolerate any field being missing.
import '../systemCa';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export interface EspnClientOptions {
  sport: string;
  groups: string;
  requestTimeoutMs: number;
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

  scoreboardUrl(date: string): string {
    return `${BASE}/${this.opts.sport}/scoreboard?dates=${date}&groups=${this.opts.groups}&limit=300`;
  }

  summaryUrl(eventId: string): string {
    return `${BASE}/${this.opts.sport}/summary?event=${eventId}`;
  }

  scoreboard(date: string): Promise<FetchResult> {
    return this.getJson(this.scoreboardUrl(date));
  }

  summary(eventId: string): Promise<FetchResult> {
    return this.getJson(this.summaryUrl(eventId));
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
