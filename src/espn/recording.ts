import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip, gunzipSync, gzipSync } from 'node:zlib';

// Recordings are NDJSON where every line is its own gzip member, so the file can be appended to
// safely while recording and still be read with a single gunzip (multi-member gzip).

export interface RecordLine {
  t: string; // ISO time the response arrived
  kind: 'scoreboard' | 'summary' | 'final-summary' | 'error';
  url?: string;
  eventId?: string;
  status?: number;
  body?: unknown;
  error?: string;
}

export function appendRecord(file: string, rec: RecordLine): number {
  mkdirSync(path.dirname(file), { recursive: true });
  const buf = gzipSync(JSON.stringify(rec) + '\n');
  appendFileSync(file, buf);
  return buf.length;
}

/** Stream records one at a time (a full game day is far too big to hold as one string). */
export async function* streamRecords(file: string): AsyncGenerator<RecordLine> {
  if (!existsSync(file)) return;
  const gunzip = createGunzip();
  const lines = createInterface({ input: createReadStream(file).pipe(gunzip), crlfDelay: Infinity });
  // The recorder may be mid-append: a truncated last member just ends the stream.
  gunzip.on('error', () => lines.close());
  for await (const line of lines) {
    if (!line) continue;
    try {
      yield JSON.parse(line) as RecordLine;
    } catch {
      // A torn last line (recorder killed mid-write) is skipped.
    }
  }
}

/** Merge several time-ordered record streams into one, oldest first. */
export async function* mergeByTime(...streams: AsyncGenerator<RecordLine>[]): AsyncGenerator<RecordLine> {
  const heads = await Promise.all(streams.map((s) => s.next()));
  for (;;) {
    let best = -1;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].done) continue;
      if (best < 0 || (heads[i].value as RecordLine).t < (heads[best].value as RecordLine).t) best = i;
    }
    if (best < 0) return;
    yield heads[best].value as RecordLine;
    heads[best] = await streams[best].next();
  }
}

export function recordingFiles(dir: string) {
  return {
    scoreboard: path.join(dir, 'scoreboard.ndjson.gz'),
    summaries: path.join(dir, 'summaries.ndjson.gz'),
    finals: path.join(dir, 'finals.ndjson.gz'),
  };
}

export function readRecords(file: string): RecordLine[] {
  const text = gunzipSync(readFileSync(file)).toString('utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordLine);
}

// Summary keys worth keeping for replay, tuning and halftime highlights. The rest (news, odds,
// standings, betting) is large and unused.
const SUMMARY_KEEP = ['header', 'drives', 'scoringPlays', 'videos', 'winprobability', 'leaders', 'broadcasts', 'format', 'wallclockAvailable', 'gameInfo'];

export function trimSummary(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const k of SUMMARY_KEEP) if (k in (body as object)) out[k] = (body as Record<string, unknown>)[k];
  return out;
}
