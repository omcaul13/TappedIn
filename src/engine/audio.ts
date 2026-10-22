import type { AudioConfig } from '../config';
import { sportOf } from '../sports';
import type { ScreenState } from './director';
import type { GameView } from './ranker';

// Which screen has sound. Manual: the one you picked. Auto: the most exciting screen, with its own
// dwell; clicking a tile in auto mode pins sound there for manualPinSeconds.

export interface AudioState {
  mode: 'manual' | 'auto';
  focus: number;
  lastChangeAt: number;
  pinnedUntil: number;
  /** Per-screen fullscreen: sound follows that screen, and this is the choice to go back to. */
  held?: { screen: number; mode: 'manual' | 'auto'; focus: number } | null;
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
  // The sport's own normalized score, so a screen of one sport compares fairly with another's.
  const x = sportOf(v.game.sport).excitement(v.game);
  return { score: x.score, why: `${v.game.shortName}: ${x.why}` };
}

export function audioStep(prev: AudioState, screens: ScreenState[], views: Map<string, GameView>, now: number, cfg: AudioConfig): { state: AudioState; decision: AudioDecision | null } {
  const state = { ...prev, mode: prev.mode };
  if (state.held) return { state, decision: null }; // a screen is fullscreen: sound stays with it
  if (state.focus === 0) return { state, decision: null }; // you muted every screen: auto mode leaves it muted
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

/**
 * A screen went fullscreen: sound moves to it (auto mode stops moving it) until releaseAudio. The
 * choice from before is kept, also when another screen goes fullscreen in between.
 */
export function holdAudio(prev: AudioState, screen: number, now: number): { state: AudioState; decision: AudioDecision | null } {
  const saved = prev.held ? { mode: prev.held.mode, focus: prev.held.focus } : { mode: prev.mode, focus: prev.focus };
  const state: AudioState = { ...prev, focus: screen, held: { screen, ...saved } };
  if (prev.focus === screen) return { state, decision: null };
  state.lastChangeAt = now;
  return { state, decision: { at: now, from: prev.focus, to: screen, mode: prev.mode, reason: `screen ${screen} is fullscreen` } };
}

/** Back to the grid: sound and mode go back to what they were before fullscreen. */
export function releaseAudio(prev: AudioState, now: number): { state: AudioState; decision: AudioDecision | null } {
  if (!prev.held) return { state: prev, decision: null };
  const { mode, focus } = prev.held;
  const state: AudioState = { ...prev, mode, focus, held: null, pinnedUntil: 0 };
  if (prev.focus === focus) return { state, decision: null };
  state.lastChangeAt = now;
  return { state, decision: { at: now, from: prev.focus, to: focus, mode, reason: 'back to the grid: sound as before fullscreen' } };
}