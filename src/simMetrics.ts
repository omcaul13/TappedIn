import { existsSync } from 'node:fs';
import type { Config } from './config';
import { normalizeSummaryPlays } from './espn/normalize';
import { readRecords, recordingFiles } from './espn/recording';
import type { PlaySnap } from './engine/types';
import type { SimResult } from './sim';

// Before/after metrics for a simulated day, scored against what really happened (final play-by-play):
//  - switches per screen-hour, break fill-ins
//  - "short" fill-ins: the home game's next live play reached the viewer < 45 s after the switch
//  - average time away from home per fill-in
//  - long breaks caught: real stoppages >= 90 s on a home game during which the screen showed something else

export interface SimMetrics {
  label: string;
  screenHours: number;
  autoSwitches: number;
  switchesPerScreenHour: number;
  fills: number;
  shortFills: number | null;
  avgAwaySec: number;
  longBreaks: number | null;
  longBreaksCaught: number | null;
  homeShare: number;
  /** Minutes spent on a fill-in while the home game was really in a stoppage of 60 s+ (good). */
  skippedBreakMin: number | null;
  /** Minutes spent on a fill-in while the home game was really in play (cost). */
  missedActionMin: number | null;
}

const RESUME = new Set(['snap', 'kickoff', 'score']);

export function loadFinalPlays(dir: string): Map<string, PlaySnap[]> {
  const out = new Map<string, PlaySnap[]>();
  const f = recordingFiles(dir).finals;
  if (!existsSync(f)) return out;
  for (const r of readRecords(f)) {
    if (!r.eventId) continue;
    const plays = normalizeSummaryPlays(r.body).filter((p) => p.wallclock !== null);
    if (plays.length >= 50) out.set(r.eventId, plays);
  }
  return out;
}

export function computeMetrics(label: string, res: SimResult, finals: Map<string, PlaySnap[]>, cfg: Config, longBreakSec = 90, shortSec = 45): SimMetrics {
  const delay = cfg.breakDetector.streamDelaySeconds * 1000;
  const decisions = res.entries.flatMap((e) => (e.type === 'decision' ? [e] : []));
  const auto = decisions.filter((d) => d.switched && d.auto && d.rule !== 'HOME_SYNC');
  const screens = Math.max(1, res.homes.length);
  const hours = res.startedAt && res.endedAt ? (res.endedAt - res.startedAt) / 3_600_000 : 0;
  const screenHours = hours * screens;
  const fills = decisions.filter((d) => d.rule === 'BREAK_FILL');

  // Short fill-ins: when did the home game's next live play reach the viewer after the switch?
  const homeAt = (screen: number, at: number) => {
    const p = res.timeline.findLast((x) => x.at <= at) ?? res.timeline[0];
    return p?.screens[screen - 1]?.home ?? null;
  };
  let shortFills = 0;
  let judged = 0;
  for (const f of fills) {
    const home = homeAt(f.screen, f.at);
    const plays = home ? finals.get(home) : undefined;
    if (!plays) continue;
    const next = plays.find((p) => RESUME.has(p.kind) && p.wallclock! + delay > f.at);
    if (!next) continue;
    judged++;
    if (next.wallclock! + delay - f.at < shortSec * 1000) shortFills++;
  }

  // Long breaks on home games and whether the screen was elsewhere during them.
  let longBreaks = 0;
  let caught = 0;
  let anyFinals = false;
  const tl = res.timeline;
  if (tl.length) {
    for (let s = 0; s < screens; s++) {
      const homes = new Set(tl.map((p) => p.screens[s]?.home).filter((h): h is string => !!h));
      for (const h of homes) {
        const plays = finals.get(h);
        if (!plays) continue;
        anyFinals = true;
        for (let i = 0; i < plays.length - 1; i++) {
          if (plays[i].kind === 'endPeriod' && plays[i].period === 2) continue; // halftime is its own thing
          const j = plays.findIndex((p, k) => k > i && RESUME.has(p.kind));
          if (j < 0) continue;
          const start = plays[i].wallclock! + delay;
          const end = plays[j].wallclock! + delay;
          if (end - start < longBreakSec * 1000) continue;
          const during = tl.filter((p) => p.at >= start && p.at < end && p.screens[s]?.home === h);
          if (during.length < 3) continue; // this game wasn't this screen's home then
          longBreaks++;
          if (during.some((p) => p.screens[s].kind !== 'home')) caught++;
          i = j - 1;
        }
      }
    }
  }

  // Every fill-in tick: was the home game (as the viewer would see it) in a real stoppage or in play?
  let skipped = 0;
  let missed = 0;
  let scored = false;
  const tickSec = cfg.director.tickSeconds;
  for (const p of tl) {
    p.screens.forEach((s) => {
      if (s.kind !== 'fill-in' || !s.home) return;
      const plays = finals.get(s.home);
      if (!plays) return;
      scored = true;
      const v = p.at - delay;
      let lo = 0;
      let hi = plays.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (plays[mid].wallclock! <= v) lo = mid;
        else hi = mid - 1;
      }
      if (plays[lo].wallclock! > v) return; // before kickoff
      const next = plays.find((x, k) => k > lo && RESUME.has(x.kind));
      if (next && next.wallclock! - plays[lo].wallclock! >= 60_000) skipped += tickSec;
      else missed += tickSec;
    });
  }

  const shares = Object.values(res.timeShare);
  const total = shares.reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0) || 1;
  const away = shares.reduce((a, m) => a + (m['fill-in'] ?? 0), 0);
  const home = shares.reduce((a, m) => a + (m.home ?? 0), 0);
  return {
    label,
    screenHours,
    autoSwitches: auto.length,
    switchesPerScreenHour: screenHours > 0 ? auto.length / screenHours : 0,
    fills: fills.length,
    shortFills: judged ? shortFills : null,
    avgAwaySec: fills.length ? away / fills.length : 0,
    longBreaks: anyFinals ? longBreaks : null,
    longBreaksCaught: anyFinals ? caught : null,
    homeShare: home / total,
    skippedBreakMin: scored ? skipped / 60 : null,
    missedActionMin: scored ? missed / 60 : null,
  };
}
