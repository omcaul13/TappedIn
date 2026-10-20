import { statusOutcome, type DetectorMemory } from './breakDetector';
import type { BreakSpec } from '../sports/types';
import { forecastBreak, survival, type BreakModel } from './forecast';
import type { GameState, LastPlay } from './gameStore';
import type { Assessment, BreakState, Signal } from './types';

// Break detection with the forecast model (switch only during long breaks):
//  - BREAK only when the break that follows the latest play is predicted to have at least
//    `minBreakSeconds` left for the viewer with probability >= `confidence` (sensitivity preset).
//  - Hysteresis: once in BREAK, stay until a NEW live-ball play appears for this game (play-by-play or
//    a new scoreboard last play), never on clock movement or signals fading. A data safety net
//    (`maxBreakSeconds`, default 10 min) covers ESPN going quiet.
//  - TD/FG -> PAT -> kickoff: a kickoff after the play that triggered a score break continues the
//    break (it becomes the "kickoff after score" stoppage) instead of ending it. Each sport says which
//    plays end or continue a break (`BreakSpec` from src/sports/).

export interface ForecastDetectorOptions {
  model: BreakModel;
  staleDataSeconds: number;
  streamDelaySeconds: number;
  dataDelaySeconds: number;
  lingerSeconds: number;
  minBreakSeconds: number;
  confidence: number;
  maxBreakSeconds: number;
  /** The sport's stoppage rules (categories, what resumes play). */
  breaks: BreakSpec;
  /** Categories that never start a break at this sensitivity. */
  excludeCategories?: readonly string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mmss = (s: number | null) => (s === null ? '?' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

function isNewer(p: LastPlay, t: { at: number; order: number; playId: string | null }): boolean {
  if (p.playId !== null && p.playId === t.playId) return false;
  return p.at > t.at || (p.at === t.at && p.order > t.order);
}

export function assessForecast(g: GameState, mem: DetectorMemory | undefined, now: number, o: ForecastDetectorOptions): { assessment: Assessment; memory: DetectorMemory } {
  const prevState = mem?.state ?? 'LIVE';
  const finish = (state: BreakState, score: number, signals: Signal[], reasons: string[], forecast?: Assessment['forecast'], extra: Partial<DetectorMemory> = {}) => {
    const since = state !== prevState || !mem ? now : mem.since;
    const memory: DetectorMemory = {
      state,
      since,
      breakStartedAt: state === 'BREAK' ? (prevState === 'BREAK' && mem?.breakStartedAt ? mem.breakStartedAt : now) : null,
      suppressUntilAfter: mem?.suppressUntilAfter ?? null,
      trigger: state === 'BREAK' ? (extra.trigger ?? mem?.trigger ?? null) : null,
      ...extra,
    };
    if (state !== 'BREAK') memory.trigger = null;
    return { assessment: { state, score: Math.round(score * 100) / 100, signals, reasons, since, forecast }, memory };
  };

  const status = statusOutcome(g, now, o);
  if (status) return finish(status.state, status.score, status.signals, status.reasons);

  const timing = { dataDelaySeconds: o.dataDelaySeconds, streamDelaySeconds: o.streamDelaySeconds };
  const lp = g.lastPlay;
  const fc = (category: string, at: number) => forecastBreak(o.model, category, at, now, timing, o.minBreakSeconds, g.playsCheckedAt ?? now, o.breaks.labels);
  const asForecast = (f: ReturnType<typeof fc>): Assessment['forecast'] => ({ category: f.category, label: f.label, confidence: f.confidence, remainingSec: f.remainingSec, quietSec: f.quietSec });
  const describe = (f: ReturnType<typeof fc>) => `${f.label}: ~${mmss(f.remainingSec)} left (${pct(f.confidence)} chance of ${o.minBreakSeconds}s+), quiet ${f.quietSec}s`;

  // ---- already in a break: hold until a new live-ball play ------------------------------------
  if (prevState === 'BREAK' && mem?.trigger) {
    const t = mem.trigger;
    if (lp && isNewer(lp, t)) {
      const continued = o.breaks.continues?.(lp, t.category);
      if (continued) {
        // TD/FG -> PAT -> kickoff: the commercial usually comes after the kickoff; keep the break.
        const f = fc(continued, lp.at);
        return finish('BREAK', f.confidence, [{ name: f.category, weight: f.confidence, detail: describe(f) }], [describe(f)], asForecast(f), {
          trigger: { playId: lp.playId, at: lp.at, order: lp.order, category: continued },
        });
      }
      if (o.breaks.resumes.has(lp.kind)) return finish('LIVE', 0, [], [`play resumed: ${lp.typeText}${lp.text ? `: ${lp.text.slice(0, 70)}` : ''}`]);
    }
    if (o.breaks.timedResume) {
      // No "play resumed" signal (tennis): go back once the break has more likely than not ended on the
      // viewer's screen. The trigger time is known only to a poll interval, hence the 10 s head start.
      const f = fc(t.category, t.at);
      if (survival(o.model, t.category, f.viewerElapsedSec + 10) <= 0.5) {
        return finish('LIVE', 0, [], [`${f.label} over on your screen (${Math.max(0, f.viewerElapsedSec)}s); back for play`], undefined, { suppressUntilAfter: lp?.at ?? t.at });
      }
    }
    if (now - (mem.breakStartedAt ?? now) > o.maxBreakSeconds * 1000) {
      return finish('LIVE', 0, [], [`no new play for ${o.maxBreakSeconds}s; assuming play resumed (data safety net)`], undefined, { suppressUntilAfter: lp?.at ?? now });
    }
    const f = fc(t.category, t.at);
    return finish('BREAK', f.confidence, [{ name: f.category, weight: f.confidence, detail: describe(f) }], [describe(f)], asForecast(f));
  }

  // ---- in play: does the stoppage after the latest play look like a long break? -----------------
  if (!lp) return finish('LIVE', 0, [], ['in play']);
  const cat = o.breaks.categorize(lp, lp.prevKind ? { kind: lp.prevKind } : null);
  if (!cat || o.excludeCategories?.includes(cat)) return finish('LIVE', 0, [], ['in play']);
  if (mem?.suppressUntilAfter != null && lp.at <= mem.suppressUntilAfter) return finish('LIVE', 0, [], [o.breaks.timedResume ? 'in play (waiting for the next game)' : 'in play (waiting for a new play after the safety net)']);
  const f = fc(cat, lp.at);
  const signal: Signal = { name: cat, weight: f.confidence, detail: describe(f) };
  const linger = o.breaks.linger.has(cat) ? o.lingerSeconds : 0;
  if (f.viewerElapsedSec < linger) return finish('LIVE', f.confidence, [signal], [`${f.label} still playing out on your screen`], asForecast(f));
  if (f.confidence >= o.confidence) {
    return finish('BREAK', f.confidence, [signal], [describe(f)], asForecast(f), { trigger: { playId: lp.playId, at: lp.at, order: lp.order, category: cat } });
  }
  return finish('LIVE', f.confidence, [signal], [`${describe(f)}; below ${pct(o.confidence)}`], asForecast(f));
}
