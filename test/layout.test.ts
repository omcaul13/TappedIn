import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { Engine } from '../src/engine/engine';
import { etTime, runSim } from '../src/sim';
import { FIXTURES } from './helpers';

const require = createRequire(import.meta.url);
type Rect = { x: number; y: number; width: number; height: number };
const { cellRects } = require('../electron/layout.cjs') as { cellRects(n: number, w: number, h: number, top: number, gap: number): Rect[] };

/** The 2x2 formula electron/main.cjs used before 1-3 screen layouts existed. */
function oldCellBounds(screen: number, w: number, h: number, top: number, gap: number): Rect {
  const gh = Math.max(0, h - top);
  const cw = Math.floor((w - gap) / 2);
  const ch = Math.floor((gh - gap) / 2);
  const col = (screen - 1) % 2;
  const row = Math.floor((screen - 1) / 2);
  return { x: col * (cw + gap), y: top + row * (ch + gap), width: col ? w - cw - gap : cw, height: row ? gh - ch - gap : ch };
}

const area = (r: Rect) => r.width * r.height;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('screen layout', () => {
  it('4 screens is exactly the old 2x2 grid', () => {
    for (const [w, h] of [[1600, 940], [1920, 1080], [1366, 768]]) {
      expect(cellRects(4, w, h, 36, 2)).toEqual([1, 2, 3, 4].map((s) => oldCellBounds(s, w, h, 36, 2)));
    }
  });

  it('1, 2 and 3 screens fill the area below the top bar without overlapping', () => {
    const [w, h, top, gap] = [1600, 940, 36, 2];
    for (const n of [1, 2, 3]) {
      const rects = cellRects(n, w, h, top, gap);
      expect(rects).toHaveLength(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
      const covered = rects.reduce((a, r) => a + area(r), 0);
      expect(covered).toBeGreaterThan(w * (h - top) * 0.99);
      for (const r of rects) expect(r.y).toBeGreaterThanOrEqual(top);
    }
    expect(cellRects(1, w, h, top, gap)[0]).toEqual({ x: 0, y: top, width: w, height: h - top });
  });

  it('3 screens: screen 1 is the big one on the left', () => {
    const [a, b, c] = cellRects(3, 1600, 940, 36, 2);
    expect(a.height).toBe(940 - 36);
    expect(b.x).toBe(c.x);
    expect(b.x).toBeGreaterThan(a.x);
    expect(area(a)).toBeGreaterThan(area(b) * 1.9);
  });
});

describe('engine with fewer screens', () => {
  it('a 2-screen engine only commands screens 1-2 and keeps every rule', async () => {
    const cfg = loadConfig();
    const date = '20261017';
    const res = await runSim(cfg, { root: PROJECT_ROOT, date, dir: path.join(FIXTURES, `replay-${date}`), fromMs: etTime(date, '18:45'), screens: 2 });
    expect(res.homes).toHaveLength(2);
    expect(res.violations).toEqual([]);
    const screens = res.entries.flatMap((e) => (e.type === 'decision' ? [e.screen] : []));
    expect(screens.length).toBeGreaterThan(0);
    expect(Math.max(...screens)).toBeLessThanOrEqual(2);
  });

  it('resizeScreens keeps the remaining screens as they were', () => {
    const e = new Engine(loadConfig(), 4);
    e.director.screens[0].homeGameId = 'g1';
    e.director.screens[3].homeGameId = 'g4';
    e.resizeScreens(2);
    expect(e.director.screens.map((s) => s.id)).toEqual([1, 2]);
    expect(e.director.screens[0].homeGameId).toBe('g1');
    e.resizeScreens(3);
    expect(e.director.screens.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(e.director.screens[2].homeGameId).toBeNull();
  });
});
