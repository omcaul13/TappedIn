import type { AudioConfig } from '../config';
import type { ScreenState } from './director';
import type { GameView } from './ranker';

// Which screen has sound. Manual: the one you picked. Auto: the most exciting screen, with its own
// dwell; clicking a tile in auto mode pins sound there for manualPinSeconds.

export interface AudioState {
  mode: 'manual' | 'auto';
  focus: number;
  lastChangeAt: number;
  pinnedUntil: number;
}

export interface AudioDecision {
  at: number;
  from: number;
  to: number;
  mode: 'manual' | 'auto';
  reason: string;
}

/** Auto mode only moves sound when the new screen is clearly more exciting. */
const HYSTERESIS = 10;

export function createAudio(cfg: AudioConfig, focus = 1): AudioState {
  return { mode: cfg.mode, focus, lastChangeAt: Number.NEGATIVE_INFINITY, pinnedUntil: 0 };
}

/** Excitement score of what a screen is showing right now. */
export function excitement(sc: ScreenState, views: Map<string, GameView>): { score: number; why: string } {
  if (sc.showing.kind !== 'game') return { score: 0, why: sc.showing.kind === 'halftime' ? 'highlights' : 'nothing' };
  const v = views.get(sc.showing.gameId);
  if (!v) return { score: 0, why: 'unknown game' };
  if (v.assessment.state !== 'LIVE') return { score: 1, why: `${v.game.shortName} ${v.assessment.state.toLowerCase()}` };
  const g = v.game;
  const margin = Math.abs(g.home.score - g.away.score);
  const late = (g.period ?? 0) >= 4;
  let score = Math.max(0, 40 - margin * 2);
  const why: string[] = [];
  if (g.situation?.isRedZone) {
    score += 100;
    why.push('red zone');
  }
  if (late && margin <= 8) {
    score += 60;
    why.push('one-score game in the 4th');
  }
  score += (g.period ?? 0) * 2;
  why.push(`margin ${margin}`);
  return { score, why: `${g.shortName}: ${why.join(', ')}` };
}

export function audioStep(prev: AudioState, screens: ScreenState[], views: Map<string, GameView>, now: number, cfg: AudioConfig): { state: AudioState; decision: AudioDecision | null } {
  const state = { ...prev, mode: prev.mode };
  if (state.mode !== 'auto' || now < state.pinnedUntil || now - state.lastChangeAt < cfg.autoDwellSeconds * 1000) return { state, decision: null };
  const scored = screens.map((sc) => ({ id: sc.id, ...excitement(sc, views) }));
  const current = scored.find((x) => x.id === state.focus);
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);
  if (!best || best.id === state.focus || best.score < (current?.score ?? 0) + HYSTERESIS) return { state, decision: null };
  const decision: AudioDecision = { at: now, from: state.focus, to: best.id, mode: 'auto', reason: best.why };
  state.focus = best.id;
  state.lastChangeAt = now;
  return { state, decision };
}

/** You clicked a tile's sound button (or pressed 1…4). Screen 0 mutes every screen. */
export function setAudioFocus(prev: AudioState, screen: number, now: number, cfg: AudioConfig): { state: AudioState; decision: AudioDecision } {
  const state = { ...prev, focus: screen, lastChangeAt: now, pinnedUntil: prev.mode === 'auto' ? now + cfg.manualPinSeconds * 1000 : 0 };
  const what = screen === 0 ? 'you muted every screen' : `you picked screen ${screen}`;
  return { state, decision: { at: now, from: prev.focus, to: screen, mode: prev.mode, reason: prev.mode === 'auto' ? `${what} (pinned ${cfg.manualPinSeconds}s)` : what } };
}

export function setAudioMode(prev: AudioState, mode: 'manual' | 'auto'): AudioState {
  return { ...prev, mode, pinnedUntil: 0 };
}
