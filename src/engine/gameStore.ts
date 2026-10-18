import { classifyPlay } from '../espn/normalize';
import type { GameSnapshot, Phase, PlayKind, PlaySnap } from './types';

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

  /** Feed one scoreboard poll (already normalized). */
  ingestSnapshots(snaps: GameSnapshot[], now: number): void {
    for (const snap of snaps) this.ingestSnapshot(snap, now);
  }

  ingestSnapshot(snap: GameSnapshot, now: number): void {
    const est = now - this.opts.dataDelaySeconds * 1000;
    let g = this.games.get(snap.id);
    if (!g) {
      g = { id: snap.id, snap, prevSnap: null, phaseSince: now, prevPhase: null, events: [], lastActivityAt: null, dataUpdatedAt: now, playsCheckedAt: snap.situation?.lastPlay ? now : null, hasPlayByPlay: false, plays: [], lastPlay: null };
      this.games.set(snap.id, g);
      this.seenPlays.set(snap.id, new Map());
      const lp = snap.situation?.lastPlay;
      if (lp) {
        this.seen(g.id).set(lp.id, now); // history before we started watching
        this.setLastPlay(g, { playId: lp.id, at: est, order: this.syntheticOrder++, kind: classifyPlay(lp.typeText, lp.scoreValue > 0, lp.scoreValue), typeText: lp.typeText, text: lp.text, period: snap.period, isTurnover: false });
      }
      // First seen between quarters (e.g. "15:00 - 2nd" before the first snap): that's a TV break.
      if (snap.phase === 'LIVE' && (snap.endOfPeriod || (snap.clockSec === 900 && (snap.period === 2 || snap.period === 4)))) {
        this.push(g, { kind: 'endPeriod', at: est, seenAt: now, order: this.syntheticOrder++, playId: null, source: 'scoreboard', detail: `quarter break (${snap.detail})` });
        const ended = snap.endOfPeriod ? snap.period : (snap.period ?? 2) - 1;
        this.setLastPlay(g, { playId: null, at: est, order: this.syntheticOrder++, kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: ended, isTurnover: false });
      }
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
    const lp = snap.situation?.lastPlay;
    if (lp) g.playsCheckedAt = now;
    if (lp && !this.seen(g.id).has(lp.id)) {
      this.seen(g.id).set(lp.id, now);
      const kind = classifyPlay(lp.typeText, lp.scoreValue > 0, lp.scoreValue);
      this.addPlayEvents(g, { kind, id: lp.id, typeText: lp.typeText, text: lp.text, at: est, seenAt: now, order: this.syntheticOrder++, isTurnover: false, period: snap.period }, 'scoreboard');
    }

    // Score changed (catches scores even if we missed the play).
    if (snap.home.score + snap.away.score > prev.home.score + prev.away.score && snap.phase === 'LIVE') {
      const diff = snap.home.score + snap.away.score - (prev.home.score + prev.away.score);
      const kind: EventKind = diff === 1 || diff === 2 ? 'pat' : 'score';
      this.pushInferred(g, { kind, at: est, seenAt: now, order: this.syntheticOrder++, playId: null, source: 'scoreboard', detail: `score ${prev.away.score}-${prev.home.score} -> ${snap.away.score}-${snap.home.score}` });
    }

    // Timeout counter dropped (counters reset upward at halftime; ignore increases).
    const ps = prev.situation;
    const s = snap.situation;
    if (ps && s) {
      for (const side of ['home', 'away'] as const) {
        const before = side === 'home' ? ps.homeTimeouts : ps.awayTimeouts;
        const after = side === 'home' ? s.homeTimeouts : s.awayTimeouts;
        if (before !== null && after !== null && after < before) {
          this.pushInferred(g, { kind: 'timeout', at: est, seenAt: now, order: this.syntheticOrder++, playId: null, source: 'scoreboard', detail: `${snap[side].abbr} timeouts ${before}->${after}` });
        }
      }
    }

    // End of a quarter shows up in the status detail before (or instead of) an "End Period" play.
    if (snap.endOfPeriod && !prev.endOfPeriod) {
      this.pushInferred(g, { kind: 'endPeriod', at: est, seenAt: now, order: this.syntheticOrder++, playId: null, source: 'scoreboard', detail: snap.detail });
      this.setLastPlay(g, { playId: null, at: est, order: this.syntheticOrder++, kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: snap.period, isTurnover: false });
    } else if (snap.phase === 'LIVE' && !prev.endOfPeriod && prev.period !== null && snap.period !== null && snap.period > prev.period && (snap.period === 2 || snap.period === 4)) {
      // Jumped straight into the next quarter between two polls: we missed "End of 1st/3rd".
      this.pushInferred(g, { kind: 'endPeriod', at: est, seenAt: now, order: this.syntheticOrder++, playId: null, source: 'scoreboard', detail: `quarter break (now ${snap.detail})` });
      this.setLastPlay(g, { playId: null, at: est, order: this.syntheticOrder++, kind: 'endPeriod', typeText: 'End Period', text: snap.detail, period: prev.period, isTurnover: false });
    }
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
    // Inferred scoreboard events (score/timeout/quarter changes) are superseded by the real play,
    // which has a precise time; keeping both would make the play look like a resume after its own event.
    g.events = g.events.filter((e) => e.playId !== null || !this.hasPbpTwin(g, e));
    g.events.sort((a, b) => a.at - b.at || a.order - b.order);
    this.prune(g, now);
  }

  private static family(kind: EventKind): string {
    return kind === 'pat' ? 'score' : kind;
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
