import { existsSync } from 'node:fs';
import type { Config } from './config';
import { readRecords, recordingFiles } from './espn/recording';
import type { PlaySnap, SportId } from './engine/types';
import { sportOf } from './sports';
import type { SimResult } from './sim';

// Before/after metrics for a simulated day, scored against what really happened (final play-by-play):
//  - switches per screen-hour, break fill-ins
//  - "short" fill-ins: the home game's next live play reached the viewer < 45 s after the switch
//  - average time away from home per fill-in
//  - long breaks caught: real stoppages >= 90 s on a home game during which the screen showed something else
// Each sport is scored by its own rules (what counts as play resuming, which period end is halftime).
// With `sport`, only screens whose home game is that sport count (the per-sport report).

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
  /** Break fill-ins by tier: same sport, another screen's sport, any sport. */
  fillsByTier: Record<1 | 2 | 3, number>;
}

/** A finished game's timed plays and its sport. */
export type FinalPlays = PlaySnap[] & { sport?: SportId };

/** Fewest timed plays for a final to count (drops games ESPN never filled in). */
const MIN_PLAYS: Record<string, number> = { football: 50, basketball: 100, hockey: 80, baseball: 100, soccer: 10 };

export function loadFinalPlays(dir: string): Map<string, FinalPlays> {
  const out = new Map<string, FinalPlays>();
  const f = recordingFiles(dir).finals;
  if (!existsSync(f)) return out;
  for (const r of readRecords(f)) {
    if (!r.eventId) continue;
    const mod = sportOf(r.sport);
    const plays: FinalPlays = mod.summaryPlays(r.body).filter((p) => p.wallclock !== null);
    plays.sport = mod.id;
    if (plays.length >= (MIN_PLAYS[mod.family] ?? 50)) out.set(r.eventId, plays);
  }
  return out;
}

export function computeMetrics(label: string, res: SimResult, finals: Map<string, FinalPlays>, cfg: Config, longBreakSec = 90, shortSec = 45, sport?: SportId): SimMetrics {
  const delay = cfg.breakDetector.streamDelaySeconds * 1000;
  // Games without finals (tennis has no play-by-play) take their sport from the timeline.
  const timelineSport = new Map(res.timeline.flatMap((p) => p.screens.flatMap((s) => (s.home && s.sport ? [[s.home, s.sport] as const] : []))));
  const sportOfGame = (id: string | null) => (id ? (finals.get(id)?.sport ?? timelineSport.get(id) ?? 'cfb') : null);
  const resumes = (id: string) => sportOf(sportOfGame(id)).breaks.resumes as ReadonlySet<string>;
  /** Period ends that don't start a forecastable stoppage (halftime, end of game) aren't breaks to catch. */
  const isHalftime = (id: string, p: PlaySnap) => p.kind === 'endPeriod' && sportOf(sportOfGame(id)).breaks.categorize(p) === null;
  const homeAt = (screen: number, at: number) => {
    const p = res.timeline.findLast((x) => x.at <= at) ?? res.timeline[0];
    return p?.screens[screen - 1]?.home ?? null;
  };
  const counts = (screen: number, at: number) => !sport || sportOfGame(homeAt(screen, at)) === sport;
  const decisions = res.entries.flatMap((e) => (e.type === 'decision' && counts(e.screen, e.at) ? [e] : []));
  const auto = decisions.filter((d) => d.switched && d.auto && d.rule !== 'HOME_SYNC');
  const screens = Math.max(1, res.homes.length);
  const hours = res.startedAt && res.endedAt ? (res.endedAt - res.startedAt) / 3_600_000 : 0;
  const tickHours = cfg.director.tickSeconds / 3600;
  const screenHours = sport ? res.timeline.reduce((a, p) => a + p.screens.filter((x) => sportOfGame(x.home) === sport).length * tickHours, 0) : hours * screens;
  const fills = decisions.filter((d) => d.rule === 'BREAK_FILL');
  const fillsByTier: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const f of fills) fillsByTier[f.tier ?? 1]++;

  // Short fill-ins: when did the home game's next live play reach the viewer after the switch?
  let shortFills = 0;
  let judged = 0;
  for (const f of fills) {
    const home = homeAt(f.screen, f.at);
    const plays = home ? finals.get(home) : undefined;
    if (!plays) continue;
    const next = plays.find((p) => resumes(home!).has(p.kind) && p.wallclock! + delay > f.at);
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
        if (!plays || (sport && plays.sport !== sport)) continue;
        // Sports with no commercials during play (soccer) have no breaks to catch.
        if (!sportOf(plays.sport).breaks.categories.length) continue;
        anyFinals = true;
        const resume = resumes(h);
        for (let i = 0; i < plays.length - 1; i++) {
          if (isHalftime(h, plays[i])) continue; // halftime is its own thing
          const j = plays.findIndex((p, k) => k > i && resume.has(p.kind));
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
      if (!plays || (sport && plays.sport !== sport)) return;
      const resume = resumes(s.home);
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
      const next = plays.find((x, k) => k > lo && resume.has(x.kind));
      if (next && next.wallclock! - plays[lo].wallclock! >= 60_000) skipped += tickSec;
      else missed += tickSec;
    });
  }

  let total = 0;
  let away = 0;
  let home = 0;
  if (!sport) {
    const shares = Object.values(res.timeShare);
    total = shares.reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
    away = shares.reduce((a, m) => a + (m['fill-in'] ?? 0), 0);
    home = shares.reduce((a, m) => a + (m.home ?? 0), 0);
  } else {
    for (const p of tl) {
      for (const s of p.screens) {
        if (sportOfGame(s.home) !== sport) continue;
        total += tickSec;
        if (s.kind === 'fill-in') away += tickSec;
        if (s.kind === 'home') home += tickSec;
      }
    }
  }
  total ||= 1;
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
    fillsByTier,
  };
}
