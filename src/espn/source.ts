import path from 'node:path';
import { enabledSports, type Config } from '../config';
import type { GameSnapshot, PlaySnap, SportId } from '../engine/types';
import { SPORT_IDS, sportOf } from '../sports';
import { EspnClient } from './client';
import { appendRecord, mergeByTime, recordingFiles, streamRecords, trimSummary, type RecordLine } from './recording';

// Where game data comes from. The engine only sees "here is a scoreboard / play-by-play at time t",
// so live polling, a recorded game day and a synthesized day are interchangeable.

export interface DataSink {
  scoreboard(body: unknown, at: number, sport: SportId): GameSnapshot[] | void;
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
  /** Sports with a game live (or at halftime / delayed) on the last scoreboard poll. */
  private liveSports = new Set<SportId>();
  /** Which sport each game belongs to, for its play-by-play URL. */
  private sportOfGame = new Map<string, SportId>();
  /** Sports whose scoreboard has been fetched (or failed) at least once since start. */
  private polled = new Set<SportId>();

  /** Every followed sport's scoreboard has come in once: the slate is complete enough to pick homes from. */
  firstRoundDone(): boolean {
    return enabledSports(this.cfg).every((s) => this.polled.has(s));
  }
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

  private get anyLive(): boolean {
    return this.liveSports.size > 0;
  }

  start(): void {
    // One scoreboard loop per sport; disabled sports idle until the settings turn them on.
    for (const sport of SPORT_IDS) void this.scoreboardLoop(sport);
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

  private async scoreboardLoop(sport: SportId): Promise<void> {
    // Stagger the first polls so a dozen sports don't all ask ESPN at once.
    await this.sleep(SPORT_IDS.indexOf(sport) * 700);
    while (!this.stopped) {
      let base = this.cfg.espn.scoreboardIdleSeconds;
      if (!enabledSports(this.cfg).includes(sport)) {
        this.liveSports.delete(sport);
        await this.sleep(30_000);
        continue;
      }
      try {
        const res = await this.client.scoreboard(this.opts.date, sportOf(sport).espn);
        const at = Date.parse(res.fetchedAt);
        const snaps = this.sink.scoreboard(res.body, at, sport) ?? [];
        for (const g of snaps) this.sportOfGame.set(g.id, sport);
        const live = snaps.some((g) => g.phase === 'LIVE' || g.phase === 'HALFTIME' || g.phase === 'DELAYED');
        if (live) this.liveSports.add(sport);
        else this.liveSports.delete(sport);
        // Live, or a game of this sport on a screen (a home waiting for kickoff must not go stale): often.
        // Games today but none live: the idle rate. No games today at all: rarely.
        const onScreen = new Set(this.opts.onScreen?.() ?? []);
        const watched = snaps.some((g) => onScreen.has(g.id));
        base = live || watched ? this.cfg.espn.scoreboardLiveSeconds : snaps.some((g) => g.phase === 'PRE') ? this.cfg.espn.scoreboardIdleSeconds : this.cfg.espn.scoreboardEmptySeconds;
        this.record({ t: res.fetchedAt, kind: 'scoreboard', url: res.url, status: res.status, body: res.body, sport }, 'scoreboard');
      } catch (err) {
        this.sink.error?.(`${sportOf(sport).short} scoreboard`, err);
      }
      this.polled.add(sport);
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
          const sport = this.sportOfGame.get(id) ?? 'cfb';
          const res = await this.client.summary(id, sportOf(sport).espn);
          this.sink.summary(id, res.body, Date.parse(res.fetchedAt));
          this.record({ t: res.fetchedAt, kind: 'summary', eventId: id, url: res.url, status: res.status, body: trimSummary(res.body, sport), sport }, 'summaries');
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
