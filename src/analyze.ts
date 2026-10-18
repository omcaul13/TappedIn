import type { Config } from './config';
import type { LogEntry } from './log';

// Scores the break detector against your labels (Alt+B "this is a break", Alt+V "this is live")
// and the decision log, and suggests config changes. Pure, so it's unit-tested.

export interface LabelEntry {
  at: number;
  screen: number;
  gameId: string;
  game: string;
  label: 'break' | 'live';
  showing: 'home' | 'fill-in';
  detector: { state: string; score: number; signals: { name: string; weight: number }[]; reasons: string[] } | null;
  detail: string | null;
}

export interface AnalysisReport {
  labels: { total: number; breaks: number; live: number };
  /** Positive = break. */
  confusion: { tp: number; tn: number; fp: number; fn: number; other: number };
  precision: number | null;
  recall: number | null;
  falseBreakSignals: { name: string; count: number; share: number }[];
  missedBreakScores: number[];
  missedWithNoSignal: number;
  switching: { autoSwitches: number; screenHours: number; perScreenHour: number | null; quickReturns: number; fills: number; maxBreakExits: number; duplicates: number };
  examples: { falseBreaks: LabelEntry[]; missedBreaks: LabelEntry[] };
  suggestions: string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

export function analyze(labels: LabelEntry[], log: LogEntry[], cfg: Config): AnalysisReport {
  const c = { tp: 0, tn: 0, fp: 0, fn: 0, other: 0 };
  const fps: LabelEntry[] = [];
  const fns: LabelEntry[] = [];
  for (const l of labels) {
    const st = l.detector?.state;
    if (st !== 'BREAK' && st !== 'LIVE') {
      c.other++;
      continue;
    }
    if (l.label === 'break' && st === 'BREAK') c.tp++;
    else if (l.label === 'live' && st === 'LIVE') c.tn++;
    else if (l.label === 'live') {
      c.fp++;
      fps.push(l);
    } else {
      c.fn++;
      fns.push(l);
    }
  }

  const counts = new Map<string, number>();
  for (const l of fps) for (const s of new Set(l.detector!.signals.map((x) => x.name))) counts.set(s, (counts.get(s) ?? 0) + 1);
  const falseBreakSignals = [...counts.entries()].map(([name, count]) => ({ name, count, share: count / fps.length })).sort((a, b) => b.count - a.count);
  const missedBreakScores = fns.map((l) => l.detector!.score);
  const missedWithNoSignal = fns.filter((l) => !l.detector!.signals.length).length;

  // Switching behaviour from the decision log.
  const decisions = log.flatMap((e) => (e.type === 'decision' ? [e] : []));
  const autoSwitches = decisions.filter((d) => d.switched && d.auto);
  const span = log.length ? (Math.max(...log.map((e) => e.at)) - Math.min(...log.map((e) => e.at))) / 3_600_000 : 0;
  const screens = new Set(decisions.map((d) => d.screen)).size || 4;
  const lastFill = new Map<number, number>();
  let quickReturns = 0;
  let fills = 0;
  for (const d of decisions) {
    if (d.rule === 'BREAK_FILL') {
      fills++;
      lastFill.set(d.screen, d.at);
    } else if (d.rule === 'RETURN_HOME' && lastFill.has(d.screen) && d.at - lastFill.get(d.screen)! <= 35_000) quickReturns++;
  }
  const maxBreakExits = log.filter((e) => e.type === 'assess' && e.reasons.some((r) => /assuming play resumed/.test(r))).length;
  const duplicates = decisions.filter((d) => d.duplicate).length;
  const screenHours = span * screens;

  const s: string[] = [];
  const bd = cfg.breakDetector;
  if (labels.length < 10) s.push(`Only ${labels.length} label(s) so far. Press Alt+B during commercials and Alt+V during live action (on any tile) to get reliable numbers; 20+ of each is a good start.`);
  const fpRate = c.fp + c.tn ? c.fp / (c.fp + c.tn) : 0;
  const fnRate = c.fn + c.tp ? c.fn / (c.fn + c.tp) : 0;
  if (c.fp >= 2 && fpRate > 0.2) {
    const top = falseBreakSignals[0];
    if (top && top.share >= 0.5 && top.name in bd.signals) {
      const w = bd.signals[top.name as keyof typeof bd.signals].weight;
      s.push(`False breaks: ${c.fp} of ${c.fp + c.tn} live moments were called BREAK?; "${top.name}" was active in ${pct(top.share)} of them. Try breakDetector.signals.${top.name}.weight ${w} -> ${Math.max(0, Math.round((w - 0.1) * 100) / 100)}.`);
    } else if (top && top.share >= 0.5 && top.name === 'stale') {
      s.push(`False breaks: "no new play" (stale) was active in ${pct(top.share)} of them. Try breakDetector.stale.afterSeconds ${bd.stale.afterSeconds} -> ${bd.stale.afterSeconds + 15}.`);
    } else {
      s.push(`False breaks: ${pct(fpRate)} of live moments were called BREAK?. Try breakDetector.enterThreshold ${bd.enterThreshold} -> ${Math.min(0.95, Math.round((bd.enterThreshold + 0.05) * 100) / 100)}.`);
    }
  }
  if (c.fn >= 2 && fnRate > 0.2) {
    const med = median(missedBreakScores)!;
    if (missedWithNoSignal / c.fn >= 0.5) {
      s.push(`Missed breaks: ${missedWithNoSignal} of ${c.fn} had no signal at all (typical TV timeouts). Try breakDetector.stale.afterSeconds ${bd.stale.afterSeconds} -> ${Math.max(30, bd.stale.afterSeconds - 15)}.`);
    } else if (med >= bd.enterThreshold - 0.25) {
      s.push(`Missed breaks: median score was ${med.toFixed(2)} (threshold ${bd.enterThreshold}). Try breakDetector.enterThreshold -> ${Math.max(0.35, Math.round(med * 100) / 100)}.`);
    } else {
      s.push(`Missed breaks: ${pct(fnRate)} of commercials weren't detected (median score ${med.toFixed(2)}). Check whether streamDelaySeconds (${bd.streamDelaySeconds}) is too high, which delays every signal.`);
    }
  }
  if (fills >= 5 && quickReturns / fills > 0.25) {
    s.push(`${quickReturns} of ${fills} fill-ins went back home within ~30 s (short timeouts that weren't commercials). Consider director.dwellSeconds ${cfg.director.dwellSeconds} -> ${cfg.director.dwellSeconds + 10} or a lower timeout weight.`);
  }
  if (maxBreakExits >= 3) s.push(`${maxBreakExits} breaks ended only by the ${bd.maxBreakSeconds}s safety limit. If play had already resumed, lower breakDetector.maxBreakSeconds; if those were long reviews/injuries, raise it.`);
  if (!s.length) s.push('No changes suggested: the detector agrees with your labels and switching looks calm.');

  return {
    labels: { total: labels.length, breaks: labels.filter((l) => l.label === 'break').length, live: labels.filter((l) => l.label === 'live').length },
    confusion: c,
    precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : null,
    recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : null,
    falseBreakSignals,
    missedBreakScores,
    missedWithNoSignal,
    switching: { autoSwitches: autoSwitches.length, screenHours, perScreenHour: screenHours > 0 ? autoSwitches.length / screenHours : null, quickReturns, fills, maxBreakExits, duplicates },
    examples: { falseBreaks: fps.slice(-5), missedBreaks: fns.slice(-5) },
    suggestions: s,
  };
}
