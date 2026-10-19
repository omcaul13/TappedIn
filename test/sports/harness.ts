import { readRecords } from '../../src/espn/recording';
import { synthesizeDay } from '../../src/espn/synth';
import { Engine } from '../../src/engine/engine';
import type { Assessment, PlaySnap, SportId } from '../../src/engine/types';
import { sportOf } from '../../src/sports';
import { FIXTURES, testConfig } from '../helpers';
import path from 'node:path';

// Replays recorded games (final play-by-play, test/fixtures/sports/<sport>/finals.ndjson.gz) through
// the real engine, one game at a time, and reports when its break detector said BREAK and why.

export function fixtureGames(sport: SportId): { id: string; body: unknown; plays: PlaySnap[] }[] {
  return readRecords(path.join(FIXTURES, 'sports', sport, 'finals.ndjson.gz')).map((r) => ({ id: r.eventId!, body: r.body, plays: sportOf(sport).summaryPlays(r.body).filter((p) => p.wallclock !== null) }));
}

export interface BreakStart {
  at: number;
  category: string | null;
  label: string | null;
  confidence: number;
  /** Seconds of quiet the detector knew about when it called the break. */
  quietSec: number;
  reasons: string[];
}

/** Every LIVE→BREAK change for one game, with the stoppage it followed. */
export function breakStarts(sport: SportId, body: unknown, sensitivity: 'low' | 'medium' | 'high' = 'low'): { starts: BreakStart[]; states: { at: number; state: string; a: Assessment }[] } {
  const cfg = testConfig({ switching: { sensitivity } });
  const engine = new Engine(cfg, 1);
  const starts: BreakStart[] = [];
  const states: { at: number; state: string; a: Assessment }[] = [];
  let next: number | null = null;
  const tick = (now: number) => {
    const res = engine.tick(now);
    for (const ch of res.assessments) {
      const a = engine.assessment(ch.gameId)!;
      states.push({ at: now, state: ch.to, a });
      if (ch.to === 'BREAK' && ch.from === 'LIVE') starts.push({ at: now, category: a.forecast?.category ?? null, label: a.forecast?.label ?? null, confidence: a.forecast?.confidence ?? 0, quietSec: a.forecast?.quietSec ?? 0, reasons: a.reasons });
    }
  };
  for (const ev of synthesizeDay([{ body, sport }], { dataDelaySeconds: cfg.breakDetector.dataDelaySeconds })) {
    while (next !== null && next <= ev.at) {
      tick(next);
      next += 2000;
    }
    if (ev.kind === 'snapshots') engine.ingestSnapshots(ev.snaps, ev.at);
    else engine.ingestPlays(ev.gameId, ev.plays, ev.at);
    next ??= ev.at;
  }
  return { starts, states };
}

/** The play that a break starting at `at` followed: the last play the viewer could have seen. */
export function playBefore(plays: PlaySnap[], at: number, streamDelaySec = 30): PlaySnap | null {
  let last: PlaySnap | null = null;
  for (const p of plays) if (p.wallclock! + streamDelaySec * 1000 <= at) last = p;
  return last;
}
