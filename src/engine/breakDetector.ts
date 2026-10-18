import type { BreakDetectorConfig } from '../config';
import { RESUME_KINDS, type EventKind, type GameState, type TimelineEvent } from './gameStore';
import type { Assessment, BreakState, Signal } from './types';

// "Is this game likely in a commercial break?" There's no explicit signal, so we combine hints from
// the play-by-play. Pure function: same inputs → same output, so it replays and unit-tests cleanly.
//
// Timing model:
//  - A break signal only switches on once the VIEWER could have seen the event
//    (event time + streamDelaySeconds [+ lingerSeconds for scores]) so we never cut away from a TD
//    before it's shown.
//  - Any later live-ball play we know about clears earlier signals immediately (data time), so the
//    screen heads home as soon as play resumes; the delayed stream then picks up around the snap.

export interface DetectorMemory {
  state: BreakState;
  since: number;
  breakStartedAt: number | null;
  /** After a maxBreakSeconds timeout, don't re-enter BREAK until a newer event arrives. */
  suppressUntilAfter: number | null;
  /** Forecast model: the play the current break followed. */
  trigger?: { playId: string | null; at: number; order: number; category: string } | null;
}

export interface DetectorOptions extends BreakDetectorConfig {
  staleDataSeconds: number;
}

export interface StatusOutcome {
  state: BreakState;
  score: number;
  signals: Signal[];
  reasons: string[];
}

/**
 * States that come from ESPN's status rather than the play-by-play (stale data, not started, final,
 * halftime, delayed), delayed until the viewer would see them on the stream. Null while LIVE.
 */
export function statusOutcome(g: GameState, now: number, cfg: { staleDataSeconds: number; streamDelaySeconds: number; dataDelaySeconds: number }): StatusOutcome | null {
  if (now - g.dataUpdatedAt > s(cfg.staleDataSeconds)) {
    return { state: 'UNKNOWN', score: 0, signals: [], reasons: [`no ESPN data for ${Math.round((now - g.dataUpdatedAt) / 1000)}s`] };
  }
  const phaseVisible = now >= g.phaseSince + s(cfg.streamDelaySeconds - cfg.dataDelaySeconds);
  switch (g.snap.phase) {
    case 'PRE':
      return { state: 'PRE', score: 0, signals: [], reasons: [`not started (${g.snap.detail})`] };
    case 'FINAL':
    case 'POSTPONED':
    case 'CANCELED':
      if (phaseVisible || g.snap.phase !== 'FINAL') return { state: 'FINAL', score: 0, signals: [], reasons: [g.snap.detail || 'final'] };
      return { state: 'LIVE', score: 0, signals: [], reasons: ['final on ESPN, still playing out on the stream'] };
    case 'HALFTIME':
      if (phaseVisible) return { state: 'HALFTIME', score: 0, signals: [], reasons: ['halftime'] };
      return { state: 'LIVE', score: 0, signals: [], reasons: ['halftime on ESPN, end of half still on the stream'] };
    case 'DELAYED':
      return { state: 'BREAK', score: 1, signals: [{ name: 'delay', weight: 1, detail: g.snap.detail }], reasons: [`game delayed (${g.snap.detail})`] };
    case 'UNKNOWN':
      return { state: 'UNKNOWN', score: 0, signals: [], reasons: [`unrecognised status ${g.snap.statusName}`] };
  }
  return null;
}

type SignalName = keyof BreakDetectorConfig['signals'];

const SIGNAL_FOR: Partial<Record<EventKind, SignalName>> = {
  timeout: 'timeout',
  score: 'score',
  pat: 'score',
  endPeriod: 'endOfPeriod',
  twoMinute: 'twoMinuteWarning',
  review: 'review',
  injury: 'injury',
  possessionChange: 'possessionChange',
};

const s = (sec: number) => sec * 1000;
const fmtAge = (ms: number) => `${Math.round(ms / 1000)}s ago`;

export function assess(g: GameState, mem: DetectorMemory | undefined, now: number, cfg: DetectorOptions): { assessment: Assessment; memory: DetectorMemory } {
  const prevState = mem?.state ?? 'LIVE';
  const finish = (state: BreakState, score: number, signals: Signal[], reasons: string[], extra: Partial<DetectorMemory> = {}) => {
    const changed = state !== prevState || !mem;
    const since = changed ? now : mem!.since;
    const memory: DetectorMemory = {
      state,
      since,
      breakStartedAt: state === 'BREAK' ? (prevState === 'BREAK' && mem?.breakStartedAt ? mem.breakStartedAt : now) : null,
      suppressUntilAfter: mem?.suppressUntilAfter ?? null,
      ...extra,
    };
    return { assessment: { state, score: round(score), signals, reasons, since }, memory };
  };

  // Data freshness and status-driven states (halftime, final, …) first.
  const status = statusOutcome(g, now, cfg);
  if (status) return finish(status.state, status.score, status.signals, status.reasons);

  // LIVE: collect active signals.
  const signals: Signal[] = [];
  const latestResume = lastWhere(g.events, (e) => RESUME_KINDS.has(e.kind));
  const clearedBy = (e: TimelineEvent) => latestResume !== null && after(latestResume, e);

  let lastScore: TimelineEvent | null = null;
  for (const e of g.events) {
    if (e.kind === 'score' || e.kind === 'pat') lastScore = e;
    const name = SIGNAL_FOR[e.kind];
    if (!name) continue;
    if (e.kind === 'endPeriod' && /\(Q2\)|End of (the )?2nd/i.test(e.detail)) continue; // halftime is status-driven
    if (clearedBy(e)) continue;
    const sig = cfg.signals[name];
    const startsAt = e.at + s(cfg.streamDelaySeconds) + (name === 'score' ? s(cfg.lingerSeconds) : 0);
    if (now < startsAt || now >= startsAt + s(sig.windowSeconds)) continue;
    signals.push({ name, weight: sig.weight, detail: `${e.detail} (${fmtAge(now - e.at)})` });
  }

  // The kickoff after a score is often followed by a second break.
  if (latestResume?.kind === 'kickoff' && lastScore && latestResume.at - lastScore.at < s(600)) {
    const sig = cfg.signals.kickoffAfterScore;
    const startsAt = latestResume.at + s(cfg.streamDelaySeconds);
    if (now >= startsAt && now < startsAt + s(sig.windowSeconds)) {
      signals.push({ name: 'kickoffAfterScore', weight: sig.weight, detail: `kickoff after score (${fmtAge(now - latestResume.at)})` });
    }
  }

  // No new football for a while.
  if (g.lastActivityAt !== null) {
    const quietMs = now - s(cfg.dataDelaySeconds) - g.lastActivityAt;
    const over = quietMs - s(cfg.stale.afterSeconds);
    if (over > 0) {
      const weight = Math.min(cfg.stale.max, Math.ceil(over / s(cfg.stale.stepSeconds)) * cfg.stale.perStep);
      signals.push({ name: 'stale', weight, detail: `no new play for ~${Math.round(quietMs / 1000)}s` });
    }
  }

  // One entry per signal name (strongest), combined noisy-OR.
  const best = new Map<string, Signal>();
  for (const sg of signals) if (!best.has(sg.name) || best.get(sg.name)!.weight < sg.weight) best.set(sg.name, sg);
  const active = [...best.values()].sort((a, b) => b.weight - a.weight);
  const score = 1 - active.reduce((p, sg) => p * (1 - sg.weight), 1);
  const reasons = active.map((sg) => `${sg.name} ${sg.weight.toFixed(2)}: ${sg.detail}`);
  const newestEventAt = g.events.length ? g.events[g.events.length - 1].at : 0;

  if (prevState === 'BREAK') {
    const startedAt = mem?.breakStartedAt ?? now;
    if (now - startedAt > s(cfg.maxBreakSeconds)) {
      return finish('LIVE', score, active, [`break longer than ${cfg.maxBreakSeconds}s, assuming play resumed`, ...reasons], { suppressUntilAfter: newestEventAt });
    }
    if (score <= cfg.exitThreshold) {
      // A scoring play/PAT is what *causes* the next break: its own signal starts once the viewer
      // has seen it, so it must not end the current one in the meantime.
      const scorePending = latestResume !== null && (latestResume.kind === 'score' || latestResume.kind === 'pat') && now < latestResume.at + s(cfg.streamDelaySeconds + cfg.lingerSeconds + cfg.signals.score.windowSeconds);
      const resumed = latestResume !== null && (latestResume.kind === 'snap' || latestResume.kind === 'kickoff') && latestResume.at >= startedAt - s(cfg.streamDelaySeconds);
      if (resumed) return finish('LIVE', score, active, [`play resumed: ${latestResume!.detail}`, ...reasons]);
      if (!scorePending) return finish('LIVE', score, active, ['break signals expired', ...reasons]);
    }
    return finish('BREAK', score, active, reasons.length ? reasons : ['score just happened; waiting for it to reach the stream']);
  }

  const suppressed = mem?.suppressUntilAfter != null && newestEventAt <= mem.suppressUntilAfter;
  if (score >= cfg.enterThreshold && !suppressed) return finish('BREAK', score, active, reasons, { suppressUntilAfter: null });
  return finish('LIVE', score, active, reasons.length ? reasons : ['in play']);
}

function lastWhere<T>(xs: T[], pred: (x: T) => boolean): T | null {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i])) return xs[i];
  return null;
}

/** Is event a strictly after event b in game order? */
function after(a: TimelineEvent, b: TimelineEvent): boolean {
  if (a.playId !== null && a.playId === b.playId) return false;
  return a.at > b.at || (a.at === b.at && a.order > b.order);
}

const round = (x: number) => Math.round(x * 100) / 100;
