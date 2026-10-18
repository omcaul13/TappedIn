import path from 'node:path';
import type { Config } from '../config';
import type { GameSnapshot, PlaySnap } from '../engine/types';
import { EspnClient } from './client';
import { appendRecord, mergeByTime, recordingFiles, streamRecords, trimSummary, type RecordLine } from './recording';

// Where game data comes from. The engine only sees "here is a scoreboard / play-by-play at time t",
// so live polling, a recorded game day and a synthesized day are interchangeable.

export interface DataSink {
  scoreboard(body: unknown, at: number): GameSnapshot[] | void;
  summary(gameId: string, body: unknown, at: number): void;
  /** Already-normalized input (used by the synthesizer). */
  snapshots?(snaps: GameSnapshot[], at: number): void;
  plays?(gameId: string, plays: PlaySnap[], at: number): void;
  error?(what: string, err: unknown): void;
}

// ---------------------------------------------------------------------------------------------
// Live polling

export interface LiveSourceOptions {
  date: string;
  /** Games to fetch play-by-play for, most important first (from Engine.interestingGameIds). */
  interesting: () => string[];
  /** Games on screen (homes and what screens show): fetched every hotSummarySeconds instead. */
  onScreen?: () => string[];
  /** Also record every response, so a live session can be replayed later. */
  recordDir?: string | null;
}

export class LiveSource {
  private readonly client: EspnClient;
  private stopped = false;
  private anyLive = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private cfg: Config,
    private readonly sink: DataSink,
    private readonly opts: LiveSourceOptions,
  ) {
    this.client = new EspnClient(cfg.espn);
  }

  setConfig(cfg: Config): void {
    this.cfg = cfg;
  }

  start(): void {
    void this.scoreboardLoop();
    // Two tiers: games on screen often (spots breaks and restarts sooner), likely substitutes less often.
    void this.summaryLoop(() => this.opts.onScreen?.() ?? [], () => this.cfg.espn.hotSummarySeconds);
    void this.summaryLoop(
      () => {
        const hot = new Set(this.opts.onScreen?.() ?? []);
        return this.opts.interesting().filter((id) => !hot.has(id));
      },
      () => this.cfg.espn.summarySeconds,
    );
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => this.timers.push(setTimeout(r, ms)));
  }

  private jitter(): number {
    return (Math.random() * 2 - 1) * this.cfg.espn.jitterSeconds * 1000;
  }

  private record(rec: RecordLine, file: 'scoreboard' | 'summaries'): void {
    if (this.opts.recordDir) appendRecord(recordingFiles(this.opts.recordDir)[file], rec);
  }

  private async scoreboardLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const res = await this.client.scoreboard(this.opts.date);
        const at = Date.parse(res.fetchedAt);
        const snaps = this.sink.scoreboard(res.body, at) ?? [];
        this.anyLive = snaps.some((g) => g.phase === 'LIVE' || g.phase === 'HALFTIME' || g.phase === 'DELAYED');
        this.record({ t: res.fetchedAt, kind: 'scoreboard', url: res.url, status: res.status, body: res.body }, 'scoreboard');
      } catch (err) {
        this.sink.error?.('scoreboard', err);
      }
      const base = this.anyLive ? this.cfg.espn.scoreboardLiveSeconds : this.cfg.espn.scoreboardIdleSeconds;
      await this.sleep(base * 1000 + this.jitter());
    }
  }

  private async summaryLoop(games: () => string[], everySeconds: () => number): Promise<void> {
    await this.sleep(2000);
    while (!this.stopped) {
      const ids = this.anyLive ? games() : [];
      for (const id of ids) {
        if (this.stopped) return;
        try {
          const res = await this.client.summary(id);
          this.sink.summary(id, res.body, Date.parse(res.fetchedAt));
          this.record({ t: res.fetchedAt, kind: 'summary', eventId: id, url: res.url, status: res.status, body: trimSummary(res.body) }, 'summaries');
        } catch (err) {
          this.sink.error?.(`summary ${id}`, err);
        }
        await this.sleep(300);
      }
      await this.sleep(Math.max(1000, everySeconds() * 1000 + this.jitter()));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Replay of a recorded game day

export interface ReplayOptions {
  /** recordings/<date> directory. */
  dir: string;
  fromMs?: number;
  toMs?: number;
}

/** Recorded responses in time order (scoreboard + live play-by-play), streamed from disk. */
export async function* replayRecords(opts: ReplayOptions): AsyncGenerator<RecordLine & { at: number }> {
  const files = recordingFiles(opts.dir);
  for await (const rec of mergeByTime(streamRecords(files.scoreboard), streamRecords(files.summaries))) {
    if (rec.kind !== 'scoreboard' && rec.kind !== 'summary') continue;
    const at = Date.parse(rec.t);
    if (opts.toMs !== undefined && at > opts.toMs) return;
    yield { ...rec, at };
  }
}

export function recordingDir(root: string, date: string): string {
  return path.join(root, 'recordings', date);
}
