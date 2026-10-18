import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';
import { parseConfig, PROJECT_ROOT, type Config } from '../src/config';
import { etTime, runSim } from '../src/sim';
import { FIXTURES } from './helpers';

// College football must not change while the app grows other sports. This replays both CFB fixtures
// and compares every decision and every game-state change with the sequence recorded before the
// multi-sport refactor (test/fixtures/golden/*.json, made with UPDATE_GOLDEN=1).
//  - The config is the one frozen with the goldens, so lineup or new knobs in the live config can't move it.
//  - The fill-in "why" now names its tier ("Same sport: ..."); that label is the only allowed difference.

const GOLDEN = path.join(FIXTURES, 'golden');
const date = '20261017';
const baseCfg = (): Config => parseConfig(JSON5.parse(readFileSync(path.join(GOLDEN, 'config.json5'), 'utf8')));

const TIER = /(Same sport|Other screen's sport \([^)]*\)|Other sport \([^)]*\)): /g;
const norm = (s: string) => s.replace(TIER, '');

async function sequence(name: string, mut: (c: Config) => void, opts: { synth: boolean; from?: string }): Promise<string[]> {
  const cfg = baseCfg();
  mut(cfg);
  const dir = path.join(FIXTURES, `${opts.synth ? 'finals' : 'replay'}-${date}`);
  const res = await runSim(cfg, { root: PROJECT_ROOT, date, dir, synth: opts.synth, fromMs: opts.from ? etTime(date, opts.from) : undefined });
  const lines: string[] = [`homes ${res.homes.map((h) => h.gameId).join(',')}`, `violations ${res.violations.length}`];
  for (const e of res.entries) {
    if (e.type === 'decision') lines.push(['D', e.at, e.screen, e.rule, e.switched, e.auto, e.gameId ?? '', e.duplicate ?? false, e.from, e.to, e.reasons.map(norm).join(' | '), (e.candidates ?? []).map(norm).join(' ; ')].join('\t'));
    else if (e.type === 'assess') lines.push(['A', e.at, e.gameId, e.from ?? '', e.to, e.score, e.relevant, e.reasons.join(' | ')].join('\t'));
  }
  return lines;
}

function golden(name: string, lines: string[]): string[] {
  const file = path.join(GOLDEN, `${name}.json`);
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
    writeFileSync(file, JSON.stringify(lines, null, 0).replaceAll('","', '",\n"'));
    return lines;
  }
  return JSON.parse(readFileSync(file, 'utf8')) as string[];
}

const cases: [string, (c: Config) => void, { synth: boolean; from?: string }][] = [
  ['cfb-replay-20261017', () => {}, { synth: false, from: '18:45' }],
  ['cfb-synth-20261017-low', (c) => ((c.switching.breakModel = 'forecast'), (c.switching.sensitivity = 'low')), { synth: true }],
  ['cfb-synth-20261017-high', (c) => ((c.switching.breakModel = 'forecast'), (c.switching.sensitivity = 'high')), { synth: true }],
  ['cfb-synth-20261017-classic', (c) => (c.switching.breakModel = 'classic'), { synth: true }],
];

describe('college football is unchanged (golden decision sequences)', () => {
  for (const [name, mut, opts] of cases) {
    it(name, async () => {
      const lines = await sequence(name, mut, opts);
      const want = golden(name, lines);
      expect(lines.length).toBeGreaterThan(20);
      // Compare line by line so a failure points at the first divergence.
      for (let i = 0; i < Math.max(lines.length, want.length); i++) expect(lines[i], `${name} line ${i}`).toBe(want[i]);
    });
  }
});
