import type { Config } from './config';
import { Engine, type TickResult } from './engine/engine';
import { InvariantChecker } from './engine/invariants';
import type { GameView } from './engine/ranker';
import { readRecords, recordingFiles } from './espn/recording';
import { recordingDir, replayRecords } from './espn/source';
import { synthesizeDay } from './espn/synth';
import type { LogEntry } from './log';

// Run the real engine against a recorded (or synthesized) game day on a virtual clock.
// Used by `npm run sim` and by the golden replay test.

export interface SimOptions {
  root: string;
  date: string;
  /** Rebuild the day from final play-by-play instead of a live recording. */
  synth?: boolean;
  /** Explicit recording directory (defaults to recordings/<date>). */
  dir?: string;
  fromMs?: number;
  toMs?: number;
  /** Home game ids for screens 1–4; picked automatically at `from` when omitted. */
  homes?: string[];
  /** Screens in the grid (default 4). */
  screens?: number;
  onEntry?: (e: LogEntry) => void;
  /** Record what every screen shows at every tick (for the before/after metrics). */
  captureTimeline?: boolean;
}

export interface TimelinePoint {
  at: number;
  screens: { home: string | null; onHome: boolean; kind: 'home' | 'fill-in' | 'highlights' | 'none' }[];
}

export interface SimResult {
  homes: { screen: number; gameId: string; game: string }[];
  entries: LogEntry[];
  violations: string[];
  ruleCounts: Record<string, number>;
  /** Seconds each screen spent on home / fill-in / highlights / other. */
  timeShare: Record<number, Record<string, number>>;
  ticks: number;
  startedAt: number | null;
  endedAt: number | null;
  timeline: TimelinePoint[];
}

/** "19:30" on an ESPN date key (YYYYMMDD), US Eastern → epoch ms. */
export function etTime(date: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-4';
  const hours = Number(/GMT([+-]\d+)/.exec(offset)?.[1] ?? -4);
  return guess - hours * 3600_000;
}

/** Pick up to `count` (four) watchable games: live ones with the closest scores, then the next kickoffs. */
export function autoHomes(views: Map<string, GameView>, now: number, count = 4): string[] {
  const watchable = [...views.values()].filter((v) => v.channel && v.channel.regional !== 'unconfirmed');
  const live = watchable.filter((v) => v.game.phase === 'LIVE' || v.game.phase === 'HALFTIME').sort((a, b) => Math.abs(a.game.home.score - a.game.away.score) - Math.abs(b.game.home.score - b.game.away.score));
  const soon = watchable.filter((v) => v.game.phase === 'PRE' && v.game.startTime && Date.parse(v.game.startTime) - now < 45 * 60_000).sort((a, b) => (a.game.startTime ?? '').localeCompare(b.game.startTime ?? ''));
  const picked: GameView[] = [];
  const channels = new Set<number>();
  for (const v of [...live, ...soon]) {
    if (picked.length === count || channels.has(v.channel!.number)) continue;
    picked.push(v);
    channels.add(v.channel!.number);
  }
  return picked.map((v) => v.game.id);
}

export type Feed = AsyncGenerator<{ at: number; apply: (e: Engine) => void }>;

export async function* recordedFeed(dir: string, toMs?: number): Feed {
  for await (const rec of replayRecords({ dir, toMs })) {
    if (rec.kind === 'scoreboard') yield { at: rec.at, apply: (e) => void e.ingestScoreboard(rec.body, rec.at, rec.sport ?? 'cfb') };
    else if (rec.kind === 'summary' && rec.eventId) yield { at: rec.at, apply: (e) => e.ingestSummary(rec.eventId!, rec.body, rec.at) };
  }
}

export async function* synthFeed(dir: string, cfg: Config, toMs?: number): Feed {
  const finals = readRecords(recordingFiles(dir).finals).map((r) => ({ body: r.body, sport: r.sport }));
  for (const ev of synthesizeDay(finals, { dataDelaySeconds: cfg.breakDetector.dataDelaySeconds })) {
    if (toMs !== undefined && ev.at > toMs) return;
    if (ev.kind === 'snapshots') yield { at: ev.at, apply: (e) => e.ingestSnapshots(ev.snaps, ev.at) };
    else yield { at: ev.at, apply: (e) => e.ingestPlays(ev.gameId, ev.plays, ev.at) };
  }
}

export async function runSim(cfg: Config, opts: SimOptions): Promise<SimResult> {
  const screenCount = opts.screens ?? 4;
  const engine = new Engine(cfg, screenCount);
  const checker = new InvariantChecker(cfg);
  const dir = opts.dir ?? recordingDir(opts.root, opts.date);
  const feed = opts.synth ? synthFeed(dir, cfg, opts.toMs) : recordedFeed(dir, opts.toMs);
  const tickMs = cfg.director.tickSeconds * 1000;
  const warmupFrom = opts.fromMs !== undefined ? opts.fromMs - 15 * 60_000 : undefined;

  const result: SimResult = { homes: [], entries: [], violations: checker.violations, ruleCounts: {}, timeShare: {}, ticks: 0, startedAt: null, endedAt: null, timeline: [] };
  const emit = (e: LogEntry) => {
    result.entries.push(e);
    opts.onEntry?.(e);
  };
  let homesSet = false;
  let nextTick: number | null = null;

  const collect = (res: TickResult, now: number) => {
    if (!homesSet) return;
    for (const d of res.decisions) {
      emit({ type: 'decision', ...d });
      result.ruleCounts[d.rule] = (result.ruleCounts[d.rule] ?? 0) + 1;
    }
    for (const a of res.assessments) emit({ type: 'assess', ...a });
    for (const a of res.audio) emit({ type: 'audio', ...a });
    checker.check(engine, res, now);
    const point: TimelinePoint = { at: now, screens: [] };
    for (const sc of engine.director.screens) {
      const kind = sc.showing.kind === 'halftime' ? 'highlights' : sc.showing.kind === 'game' ? (sc.showing.gameId === sc.homeGameId ? 'home' : 'fill-in') : 'none';
      const share = (result.timeShare[sc.id] ??= {});
      share[kind] = (share[kind] ?? 0) + tickMs / 1000;
      point.screens.push({ home: sc.homeGameId, onHome: kind === 'home', kind });
    }
    if (opts.captureTimeline) result.timeline.push(point);
  };

  const tick = (now: number) => {
    const res = engine.tick(now);
    result.ticks++;
    collect(res, now);
    if (!homesSet && (opts.fromMs === undefined || now >= opts.fromMs)) {
      const homes = opts.homes?.length ? opts.homes : autoHomes(engine.views(), now, screenCount);
      if (!homes.length) return;
      homesSet = true;
      result.startedAt = now;
      homes.slice(0, screenCount).forEach((gameId, i) => {
        const r = engine.act({ type: 'setHome', screen: i + 1, gameId }, now);
        result.homes.push({ screen: i + 1, gameId, game: engine.views().get(gameId)?.game.shortName ?? gameId });
        collect(r, now);
      });
    }
  };

  for await (const item of feed) {
    if (warmupFrom !== undefined && item.at < warmupFrom) continue;
    while (nextTick !== null && nextTick <= item.at) {
      tick(nextTick);
      nextTick += tickMs;
    }
    item.apply(engine);
    nextTick ??= item.at;
  }
  result.endedAt = nextTick;
  return result;
}
