import { sportOf } from '../sports';
import type { InferContext } from '../sports/types';
import type { GameSnapshot, LiveDetail, Phase, PlayKind, PlaySnap } from './types';

export type { PlayKind };

// Per-game history built from scoreboard snapshots and play-by-play. The break detector reads the
// event timeline; nothing here makes decisions.
//
// Two clocks matter:
//  - `at`:     estimated real-world time of the event (ESPN play wallclock, or first-seen minus the
//              typical ESPN data delay when only the scoreboard told us).
//  - `seenAt`: when our poller first learned about it.

export type EventKind =
  | 'snap' // any live-ball play: rush, pass, punt, penalty, sack…
  | 'kickoff'
  | 'score' // TD / FG / safety
  | 'pat'
  | 'timeout'
  | 'endPeriod'
  | 'twoMinute'
  | 'review'
  | 'injury'
  | 'possessionChange';

/** Plays that mean the ball is live again; they clear break signals from earlier events. */
export const RESUME_KINDS: ReadonlySet<EventKind> = new Set(['snap', 'kickoff', 'score', 'pat']);

export interface TimelineEvent {
  kind: EventKind;
  at: number;
  seenAt: number;
  /** Ordering tiebreak within the same `at` (play sequence number when known). */
  order: number;
  playId: string | null;
  source: 'pbp' | 'scoreboard';
  detail: string;
}

export interface GameState {
  id: string;
  snap: GameSnapshot;
  prevSnap: GameSnapshot | null;
  phaseSince: number;
  prevPhase: Phase | null;
  events: TimelineEvent[];
  /** Estimated real time of the newest play of any kind. */
  lastActivityAt: number | null;
  dataUpdatedAt: number;
  /** When we last received data that would have shown a new play (scoreboard last play or play-by-play). */
  playsCheckedAt: number | null;
  hasPlayByPlay: boolean;
  plays: PlaySnap[];
  /** The most recent play of any kind (what the current stoppage, if any, follows). */
  lastPlay: LastPlay | null;
  /** Live situation read from play-by-play, for sports whose scoreboard doesn't carry it (hockey). */
  playsLive?: LiveDetail | null;
  /** When playsLive was read (it goes stale once the game drops off the play-by-play fetches). */
  playsLiveAt?: number;
}

export interface LastPlay {
  playId: string | null;
  at: number;
  order: number;
  kind: PlayKind;
  typeText: string;
  text: string;
  period: number | null;
  isTurnover: boolean;
  /** Kind of the play before it (a kickoff right after a score is a different stoppage). */
  prevKind: PlayKind | null;
}

export interface GameStoreOptions {
  dataDelaySeconds: number;
  /** Drop events older than this (keeps memory flat over a long day). */
  keepEventsSeconds?: number;
}

/** A scoreboard-inferred event and a play-by-play event this close together are the same thing. */
const TWIN_WINDOW_MS = 150_000;

const REVIEW = /\b(review|reviewed|challenge|overturned|upheld|ruling .* stands|call stands|confirmed)\b/i;
const INJURY = /\binjur(ed|y)\b/i;
const POSSESSION_CHANGE = /\b(punt|interception|intercepted|fumble recovery \(opponent\)|turnover on downs)\b/i;

export class GameStore {
  private games = new Map<string, GameState>();
  private seenPlays = new Map<string, Map<string, number>>();
  private syntheticOrder = 1e9;

  constructor(private opts: GameStoreOptions) {}

  setOptions(opts: Partial<GameStoreOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  get(id: string): GameState | undefined {
    return this.games.get(id);
  }

  all(): GameState[] {
    return [...this.games.values()];
  }

  /** Forget a game (a final from an earlier day). */
  delete(id: string): void {
    this.games.delete(id);
    this.seenPlays.delete(id);
  }

  /** Feed one scoreboard poll (already normalized). */
  ingestSnapshots(snaps: GameSnapshot[], now: number): void {
    for (const snap of snaps) this.ingestSnapshot(snap, now);
  }

  ingestSnapshot(snap: GameSnapshot, now: number): void {
    const est = now - this.opts.dataDelaySeconds * 1000;
    let g = this.games.get(snap.id);
    if (!g) {
      g = { id: snap.id, snap, prevSnap: null, phaseSince: now, prevPhase: null, events: [], lastActivityAt: null, dataUpdatedAt: now, playsCheckedAt: (snap.situation?.lastPlay ?? snap.live?.lastPlay) ? now : null, hasPlayByPlay: false, plays: [], lastPlay: null };
      this.games.set(snap.id, g);
      this.seenPlays.set(snap.id, new Map());
      const lp = snap.situation?.lastPlay ?? snap.live?.lastPlay;
      if (lp) {
        this.seen(g.id).set(lp.id, now); // history before we started watching
        this.setLastPlay(g, { playId: lp.id, at: est, order: this.syntheticOrder++, kind: sportOf(snap.sport).classifyPlay(lp.typeText, lp.scoreValue > 0, lp.scoreValue, lp.text), typeText: lp.typeText, text: lp.text, period: snap.period, isTurnover: false });
      }
      sportOf(snap.sport).inferFirstSeen?.(g, snap, this.inferContext(g, est, now));
      return;
    }
    const prev = g.snap;
    g.prevSnap = prev;
    g.snap = snap;
    g.dataUpdatedAt = now;
    if (snap.phase !== prev.phase) {
      g.prevPhase = prev.phase;
      g.phaseSince = now;
    }

    // A new last play on the scoreboard (play-by-play may not be polled for this game).
    const lp = snap.situation?.lastPlay ?? snap.live?.lastPlay;
    if (lp) g.playsCheckedAt = now;
    if (lp && !this.seen(g.id).has(lp.id)) {
      this.seen(g.id).set(lp.id, now);
      const kind = sportOf(snap.sport).classifyPlay(lp.typeText, lp.scoreValue > 0, lp.scoreValue, lp.text);
      this.addPlayEvents(g, { kind, id: lp.id, typeText: lp.typeText, text: lp.text, at: est, seenAt: now, order: this.syntheticOrder++, isTurnover: false, period: snap.period }, 'scoreboard');
    }

    // What else the poll implies (score changes, timeout counters, quarter breaks) is per sport.
    sportOf(snap.sport).inferChange?.(g, prev, snap, this.inferContext(g, est, now));
    this.prune(g, now);
  }

  /** Feed one play-by-play fetch for a game (already normalized and in order). */
  ingestPlays(gameId: string, plays: PlaySnap[], now: number): void {
    const g = this.games.get(gameId);
    if (!g) return;
    const firstFetch = !g.hasPlayByPlay;
    g.hasPlayByPlay = true;
    g.playsCheckedAt = now;
    g.plays = plays;
    const seen = this.seen(gameId);
    for (const p of plays) {
      const knownAt = seen.get(p.id);
      const at = p.wallclock ?? (knownAt ?? now) - this.opts.dataDelaySeconds * 1000;
      if (knownAt !== undefined) {
        // Seen first on the scoreboard: now we have a precise wallclock, so re-time its events.
        if (p.wallclock !== null) {
          for (const e of g.events) {
            if (e.playId !== p.id || e.source !== 'scoreboard') continue;
            e.at = p.wallclock;
            e.order = p.seq;
            e.source = 'pbp';
          }
          if (g.lastPlay?.playId === p.id) g.lastPlay = { ...g.lastPlay, at: p.wallclock, order: p.seq, isTurnover: p.isTurnover };
        }
        continue;
      }
      seen.set(p.id, now);
      // On the first fetch for a game already in progress, only the last few plays matter.
      if (firstFetch && p.wallclock !== null && now - p.wallclock > (this.opts.keepEventsSeconds ?? 900) * 1000) continue;
      this.addPlayEvents(g, { kind: p.kind, id: p.id, typeText: p.typeText, text: p.text, at, seenAt: now, order: p.seq, isTurnover: p.isTurnover, period: p.period }, 'pbp');
    }
    const fromPlays = sportOf(g.snap.sport).liveFromPlays;
    if (fromPlays) {
      g.playsLive = fromPlays(plays, g.snap);
      g.playsLiveAt = now;
    }
    // Inferred scoreboard events (score/timeout/quarter changes) are superseded by the real play,
    // which has a precise time; keeping both would make the play look like a resume after its own event.
    g.events = g.events.filter((e) => e.playId !== null || !this.hasPbpTwin(g, e));
    g.events.sort((a, b) => a.at - b.at || a.order - b.order);
    this.prune(g, now);
  }

  private static family(kind: EventKind): string {
    return kind === 'pat' ? 'score' : kind;
  }

  private inferContext(g: GameState, est: number, now: number): InferContext {
    return {
      est,
      now,
      order: () => this.syntheticOrder++,
      push: (e) => this.push(g, e),
      pushInferred: (e) => this.pushInferred(g, e),
      setLastPlay: (p) => this.setLastPlay(g, p),
    };
  }

  private hasPbpTwin(g: GameState, e: TimelineEvent): boolean {
    const fam = GameStore.family(e.kind);
    return g.events.some((x) => x.source === 'pbp' && GameStore.family(x.kind) === fam && Math.abs(x.at - e.at) <= TWIN_WINDOW_MS);
  }

  /** Add an event inferred from scoreboard changes, unless play-by-play already has it. */
  private pushInferred(g: GameState, e: TimelineEvent): void {
    if (!this.hasPbpTwin(g, e)) this.push(g, e);
  }

  private seen(id: string): Map<string, number> {
    return this.seenPlays.get(id)!;
  }

  private addPlayEvents(
    g: GameState,
    p: { kind: PlayKind; id: string; typeText: string; text: string; at: number; seenAt: number; order: number; isTurnover: boolean; period: number | null },
    source: TimelineEvent['source'],
  ): void {
    const base = { at: p.at, seenAt: p.seenAt, order: p.order, playId: p.id, source };
    const label = `${p.typeText}${p.text ? `: ${p.text.slice(0, 70)}` : ''}`;
    this.setLastPlay(g, { playId: p.id, at: p.at, order: p.order, kind: p.kind, typeText: p.typeText, text: p.text, period: p.period, isTurnover: p.isTurnover });
    switch (p.kind) {
      case 'snap':
      case 'kickoff':
      case 'score':
      case 'pat':
      case 'timeout':
        this.push(g, { ...base, kind: p.kind, detail: label });
        break;
      case 'endPeriod':
        this.push(g, { ...base, kind: 'endPeriod', detail: `${label} (Q${p.period ?? '?'})` });
        break;
      case 'admin':
        if (/two[- ]minute/i.test(p.typeText)) this.push(g, { ...base, kind: 'twoMinute', detail: label });
        break;
    }
    if (REVIEW.test(p.text) || /review|challenge/i.test(p.typeText)) this.push(g, { ...base, kind: 'review', detail: label });
    if (INJURY.test(p.text)) this.push(g, { ...base, kind: 'injury', detail: label });
    if (p.kind === 'snap' && (p.isTurnover || POSSESSION_CHANGE.test(p.typeText) || POSSESSION_CHANGE.test(p.text))) {
      this.push(g, { ...base, kind: 'possessionChange', detail: label });
    }
    // "Activity" means actual football (not timeouts or quarter breaks): it drives the no-new-plays signal.
    if (RESUME_KINDS.has(p.kind as EventKind) && (g.lastActivityAt === null || p.at > g.lastActivityAt)) g.lastActivityAt = p.at;
  }

  /** Keep the newest play (by time, then sequence) and remember what came right before it. */
  private setLastPlay(g: GameState, p: Omit<LastPlay, 'prevKind'>): void {
    if (sportOf(g.snap.sport).breaks.ignore?.(p)) return; // e.g. a substitution during a timeout
    const cur = g.lastPlay;
    if (cur && (p.at < cur.at || (p.at === cur.at && p.order <= cur.order))) return;
    g.lastPlay = { ...p, prevKind: cur?.kind ?? null };
  }

  private push(g: GameState, e: TimelineEvent): void {
    g.events.push(e);
    if (e.source === 'scoreboard') g.events.sort((a, b) => a.at - b.at || a.order - b.order);
  }

  private prune(g: GameState, now: number): void {
    const cutoff = now - (this.opts.keepEventsSeconds ?? 900) * 1000;
    if (g.events.length && g.events[0].at < cutoff) g.events = g.events.filter((e) => e.at >= cutoff);
  }
}
