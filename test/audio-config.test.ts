import { describe, expect, it } from 'vitest';
import { audioStep, createAudio, setAudioFocus, setAudioMode } from '../src/engine/audio';
import { createDirector } from '../src/engine/director';
import { parseConfig } from '../src/config';
import type { Situation } from '../src/engine/types';
import { sec, snap, T0, testConfig, view, viewsOf } from './helpers';

const rz: Situation = { possessionTeamId: 'h', down: 2, distance: 4, yardsToEndzone: 6, downDistanceText: '2nd & 4 at X 6', possessionText: 'X 6', isRedZone: true, redZoneSource: 'derived', homeTimeouts: 1, awayTimeouts: 1, lastPlay: null };

function screensShowing(...ids: string[]) {
  const d = createDirector(ids.length);
  ids.forEach((id, i) => (d.screens[i].showing = { kind: 'game', gameId: id, channel: 800 + i }));
  return d.screens;
}

describe('audio', () => {
  const cfg = testConfig().audio;
  const views = viewsOf(view(snap({ id: 'a' }), 'LIVE'), view(snap({ id: 'b', situation: rz }), 'LIVE'));
  const screens = screensShowing('a', 'b');

  it('manual mode never moves on its own', () => {
    const s = createAudio(cfg);
    expect(s.mode).toBe('manual');
    expect(audioStep(s, screens, views, T0, cfg).decision).toBeNull();
  });

  it('auto mode follows the red zone, with its own dwell', () => {
    let s = setAudioMode(createAudio(cfg), 'auto');
    const r = audioStep(s, screens, views, T0, cfg);
    expect(r.decision).toMatchObject({ from: 1, to: 2 });
    expect(r.decision!.reason).toMatch(/red zone/);
    s = r.state;
    const quiet = viewsOf(view(snap({ id: 'a', situation: rz }), 'LIVE'), view(snap({ id: 'b' }), 'LIVE'));
    expect(audioStep(s, screens, quiet, T0 + sec(10), cfg).decision).toBeNull(); // 30s audio dwell
    expect(audioStep(s, screens, quiet, T0 + sec(31), cfg).decision).toMatchObject({ to: 1 });
  });

  it('clicking a tile in auto mode pins sound there', () => {
    const s = setAudioFocus(setAudioMode(createAudio(cfg), 'auto'), 1, T0, cfg).state;
    expect(audioStep(s, screens, views, T0 + sec(60), cfg).decision).toBeNull();
    expect(audioStep(s, screens, views, T0 + sec(121), cfg).decision).toMatchObject({ to: 2 });
  });
});

describe('config', () => {
  it('fills every default from an empty file', () => {
    const c = parseConfig({});
    expect(c.director.dwellSeconds).toBe(20);
    expect(c.breakDetector.signals.timeout).toEqual({ weight: 0.6, windowSeconds: 150 });
    expect(c.breakDetector.stale.afterSeconds).toBe(75);
    expect(c.audio.mode).toBe('manual');
    expect(c.espn.scoreboardLiveSeconds).toBe(12);
  });

  it('partial sections keep the other defaults', () => {
    const c = parseConfig({ breakDetector: { signals: { score: { weight: 0.9 } } } });
    expect(c.breakDetector.signals.score).toEqual({ weight: 0.9, windowSeconds: 150 });
    expect(c.breakDetector.signals.timeout.weight).toBe(0.6);
  });

  it('rejects bad values with a readable message', () => {
    expect(() => parseConfig({ breakDetector: { enterThreshold: 2 } })).toThrow(/enterThreshold/);
    expect(() => parseConfig({ channels: { ESPN: { number: 'abc' } } })).toThrow(/Invalid config/);
  });

  it('the shipped config file is valid', async () => {
    const { loadConfig } = await import('../src/config');
    const c = loadConfig();
    expect(c.channels.ESPN.number).toBe(849);
    expect(c.channels['Big Ten Network'].number).toBeNull();
  });
});

describe('sound mode in settings.json', async () => {
  const { parseOverrides, withOverrides } = await import('../src/config');
  it('"Follows the action" set in the app is saved and wins over the config file at the next start', () => {
    const o = parseOverrides({ audioMode: 'auto' });
    expect(withOverrides(parseConfig({}), o).audio.mode).toBe('auto');
    expect(withOverrides(parseConfig({ audio: { mode: 'auto' } }), {}).audio.mode).toBe('auto');
    expect(() => parseOverrides({ audioMode: 'loud' })).toThrow();
  });
});
