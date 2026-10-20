import { describe, expect, it } from 'vitest';
import { audioStep, createAudio, holdAudio, releaseAudio, setAudioFocus, setAudioMode } from '../src/engine/audio';
import type { AudioConfig } from '../src/config';

// Per-screen fullscreen: sound follows the fullscreen screen, auto mode leaves it alone, and the
// choice from before comes back on exit.

const cfg: AudioConfig = { mode: 'manual', autoDwellSeconds: 30, manualPinSeconds: 120 };

describe('sound in per-screen fullscreen', () => {
  it('moves to the fullscreen screen and back to the previous choice', () => {
    const a = createAudio(cfg, 2);
    const held = holdAudio(a, 3, 1000);
    expect(held.state.focus).toBe(3);
    expect(held.decision).toMatchObject({ from: 2, to: 3, reason: 'screen 3 is fullscreen' });
    const back = releaseAudio(held.state, 2000);
    expect(back.state).toMatchObject({ focus: 2, mode: 'manual', held: null });
    expect(back.decision).toMatchObject({ from: 3, to: 2 });
  });
  it('muted stays muted afterwards; a fullscreen screen that already had sound is no change', () => {
    const muted = createAudio(cfg, 0);
    expect(releaseAudio(holdAudio(muted, 1, 0).state, 1).state.focus).toBe(0);
    expect(holdAudio(createAudio(cfg, 1), 1, 0).decision).toBeNull();
  });
  it('auto mode does not move sound away while a screen is fullscreen, and resumes after', () => {
    const auto = setAudioMode(createAudio(cfg, 1), 'auto');
    const held = holdAudio(auto, 4, 0).state;
    // audioStep would need screens and views to move sound; while held it returns before looking at them.
    expect(audioStep(held, [], new Map(), 10_000_000, { ...cfg, mode: 'auto' }).decision).toBeNull();
    expect(releaseAudio(held, 1).state.mode).toBe('auto');
  });
  it('switching fullscreen from one screen to another keeps the original choice', () => {
    const a = createAudio(cfg, 2);
    const h1 = holdAudio(a, 1, 0).state;
    const h2 = holdAudio(h1, 4, 1).state;
    expect(h2.focus).toBe(4);
    expect(releaseAudio(h2, 2).state.focus).toBe(2);
  });
  it('a change you make in fullscreen applies until you exit', () => {
    const h = holdAudio(createAudio(cfg, 2), 1, 0).state;
    const muted = setAudioFocus(h, 0, 5, cfg).state;
    expect(muted.focus).toBe(0);
    expect(releaseAudio(muted, 6).state.focus).toBe(2);
  });
  it('release without a hold changes nothing', () => {
    const a = createAudio(cfg, 3);
    expect(releaseAudio(a, 0)).toEqual({ state: a, decision: null });
  });
});
