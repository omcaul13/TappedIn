import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PlayKind } from './types';

// Break forecast: "given what just happened and how long it's been quiet, how likely is it that the
// break still has at least N seconds left for the viewer?" Built from real stoppages in recorded
// play-by-play (gap from a play to the next live-ball play, by wallclock), not from guessed weights.
//
// From 76 games (10/10 + 10/17/2026): after the end of Q1/Q3 the next snap is >= 90 s away 99% of the
// time; after a kickoff that follows a score 70%; after a team timeout 50%; after an ordinary play
// 6-9% -- but once an ordinary play has been followed by 60-90 s of quiet, odds of a long break rise
// to 51-66% (that's how TV timeouts, which aren't in play-by-play, show up).

export const CATEGORIES = ['endOfQuarter', 'kickoffAfterScore', 'teamTimeout', 'changeOfPossession', 'injury', 'review', 'scorePAT', 'ordinary'] as const;
export type BreakCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<BreakCategory, string> = {
  endOfQuarter: 'End of quarter',
  kickoffAfterScore: 'Kickoff after a score',
  teamTimeout: 'Timeout',
  changeOfPossession: 'Change of possession',
  injury: 'Injury stoppage',
  review: 'Replay review',
  scorePAT: 'Score',
  ordinary: 'Stoppage',
};

export interface CategorizablePlay {
  kind: PlayKind;
  typeText: string;
  text: string;
  period: number | null;
  isTurnover?: boolean;
}

/** Category of the stoppage that follows `p`; null when the play doesn't start a forecastable break (end of half). */
export function categorize(p: CategorizablePlay, prev?: { kind: PlayKind } | null): BreakCategory | null {
  const t = p.typeText;
  if (p.kind === 'timeout' || /two[- ]minute/i.test(t)) return 'teamTimeout';
  if (p.kind === 'endPeriod') return p.period === 2 ? null : 'endOfQuarter';
  if (p.kind === 'kickoff' && prev && (prev.kind === 'score' || prev.kind === 'pat')) return 'kickoffAfterScore';
  if (/injur/i.test(p.text)) return 'injury';
  if (/\b(review|challenge|overturned|upheld)\b/i.test(p.text)) return 'review';
  if (p.isTurnover || /punt|interception|fumble recovery \(opponent\)|field goal missed|missed field goal|turnover on downs/i.test(t)) return 'changeOfPossession';
  if (p.kind === 'score' || p.kind === 'pat') return 'scorePAT';
  return 'ordinary';
}

// ---- model --------------------------------------------------------------------------------------

export interface BreakModel {
  builtAt: string;
  games: number;
  binSeconds: number;
  /** Per category: number of observed stoppages per gap bin (bin i = [i*binSeconds, (i+1)*binSeconds)). */
  categories: Record<BreakCategory, { n: number; counts: number[] }>;
}

export const DEFAULT_MODEL_PATH = path.resolve(import.meta.dirname, '..', '..', 'config', 'break-model.json');

let cached: { file: string; model: BreakModel } | null = null;
export function loadBreakModel(file = DEFAULT_MODEL_PATH): BreakModel {
  if (cached?.file === file) return cached.model;
  const model = JSON.parse(readFileSync(file, 'utf8')) as BreakModel;
  cached = { file, model };
  return model;
}

export function emptyModel(binSeconds = 5): BreakModel {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { n: 0, counts: [] as number[] }])) as BreakModel['categories'];
  return { builtAt: new Date().toISOString(), games: 0, binSeconds, categories };
}

export function addGap(model: BreakModel, category: BreakCategory, gapSec: number): void {
  const c = model.categories[category];
  const bin = Math.max(0, Math.floor(gapSec / model.binSeconds));
  while (c.counts.length <= bin) c.counts.push(0);
  c.counts[bin]++;
  c.n++;
}

/** P(gap >= t) for a category (fraction of observed stoppages that lasted at least t seconds). */
export function survival(model: BreakModel, category: BreakCategory, t: number): number {
  const c = model.categories[category];
  if (!c || c.n === 0) return 0;
  if (t <= 0) return 1;
  // Stoppages in the bin containing t count proportionally (linear within the bin).
  const pos = t / model.binSeconds;
  const bin = Math.floor(pos);
  let above = 0;
  for (let i = bin + 1; i < c.counts.length; i++) above += c.counts[i];
  above += (c.counts[bin] ?? 0) * (1 - (pos - bin));
  return above / c.n;
}

export interface BreakForecast {
  category: BreakCategory;
  label: string;
  /** P(viewer still has >= minRemaining seconds of break | quiet so far). */
  confidence: number;
  /** Median predicted break left for the viewer, seconds (null if unknown). */
  remainingSec: number | null;
  /** Seconds since the trigger play that we *know* were quiet (data horizon). */
  quietSec: number;
  /** Seconds since the viewer saw the trigger play (negative: not on screen yet). */
  viewerElapsedSec: number;
  samples: number;
}

export interface ForecastTiming {
  dataDelaySeconds: number;
  streamDelaySeconds: number;
}

/**
 * Forecast for a stoppage that started with a play of `category` at `triggerAt` (ms, real time).
 * Known quiet = checkedAt - dataDelay - triggerAt: the last poll that could have shown a newer play
 * (`checkedAt`, default now) didn't. Polls are 12-15 s apart, and counting from `now` instead overstates
 * the quiet right where possession changes split into "quick resume" vs "TV timeout".
 * Viewer elapsed = now - streamDelay - triggerAt (how much of the stoppage the viewer has already seen).
 */
export function forecastBreak(model: BreakModel, category: BreakCategory, triggerAt: number, now: number, timing: ForecastTiming, minRemainingSec: number, checkedAt = now): BreakForecast {
  const quiet = Math.max(0, (Math.min(now, checkedAt) - timing.dataDelaySeconds * 1000 - triggerAt) / 1000);
  const viewerElapsed = (now - timing.streamDelaySeconds * 1000 - triggerAt) / 1000;
  const base = survival(model, category, quiet);
  const samples = model.categories[category]?.n ?? 0;
  if (base <= 0) {
    // Quieter than anything on record: almost certainly a long stoppage, length unknown.
    return { category, label: CATEGORY_LABEL[category], confidence: samples ? 0.9 : 0, remainingSec: null, quietSec: quiet, viewerElapsedSec: viewerElapsed, samples };
  }
  const need = Math.max(quiet, viewerElapsed + minRemainingSec);
  const confidence = Math.min(1, survival(model, category, need) / base);
  // Median gap given quiet so far: smallest t with S(t)/S(quiet) <= 0.5.
  let medianGap: number | null = null;
  const c = model.categories[category];
  const maxT = c.counts.length * model.binSeconds;
  for (let t = quiet; t <= maxT; t += 1) {
    if (survival(model, category, t) / base <= 0.5) {
      medianGap = t;
      break;
    }
  }
  return {
    category,
    label: CATEGORY_LABEL[category],
    confidence: Math.round(confidence * 100) / 100,
    remainingSec: medianGap === null ? null : Math.max(0, Math.round(medianGap - Math.max(0, viewerElapsed))),
    quietSec: Math.round(quiet),
    viewerElapsedSec: Math.round(viewerElapsed),
    samples,
  };
}
