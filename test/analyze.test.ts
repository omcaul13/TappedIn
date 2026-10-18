import { describe, expect, it } from 'vitest';
import { analyze, type LabelEntry } from '../src/analyze';
import type { LogEntry } from '../src/log';
import { sec, T0, testConfig } from './helpers';

const cfg = testConfig();
let n = 0;
function label(l: 'break' | 'live', state: 'BREAK' | 'LIVE', signals: string[] = [], score = state === 'BREAK' ? 0.7 : 0.1): LabelEntry {
  return {
    at: T0 + sec(++n * 30),
    screen: 1,
    gameId: 'g',
    game: 'A @ B',
    label: l,
    showing: 'home',
    detector: { state, score, signals: signals.map((name) => ({ name, weight: 0.6 })), reasons: signals.map((s) => `${s} 0.60`) },
    detail: '5:00 - 2nd',
  };
}
const many = (k: number, f: () => LabelEntry) => Array.from({ length: k }, f);

describe('analyze-log', () => {
  it('scores the detector against labels', () => {
    const r = analyze([...many(6, () => label('break', 'BREAK', ['timeout'])), ...many(8, () => label('live', 'LIVE')), label('live', 'BREAK', ['timeout']), label('break', 'LIVE')], [], cfg);
    expect(r.confusion).toEqual({ tp: 6, tn: 8, fp: 1, fn: 1, other: 0 });
    expect(r.precision).toBeCloseTo(6 / 7);
    expect(r.recall).toBeCloseTo(6 / 7);
  });

  it('blames the signal behind most false breaks and suggests a lower weight', () => {
    const r = analyze([...many(5, () => label('live', 'BREAK', ['timeout', 'stale'])), ...many(3, () => label('live', 'BREAK', ['timeout'])), ...many(5, () => label('live', 'LIVE'))], [], cfg);
    expect(r.falseBreakSignals[0]).toMatchObject({ name: 'timeout', count: 8, share: 1 });
    expect(r.suggestions.join(' ')).toMatch(/signals\.timeout\.weight 0\.6 -> 0\.5/);
  });

  it('missed breaks with no signal point at the no-new-play timer', () => {
    const r = analyze([...many(6, () => label('break', 'LIVE', [], 0)), ...many(4, () => label('break', 'BREAK', ['timeout']))], [], cfg);
    expect(r.missedWithNoSignal).toBe(6);
    expect(r.suggestions.join(' ')).toMatch(/stale\.afterSeconds 75 -> 60/);
  });

  it('asks for more labels when there are few', () => {
    expect(analyze([label('break', 'BREAK')], [], cfg).suggestions[0]).toMatch(/Only 1 label/);
  });

  it('measures switching churn from the decision log', () => {
    const d = (rule: string, at: number, extra: Partial<LogEntry> = {}): LogEntry =>
      ({ type: 'decision', at, screen: 1, rule, switched: true, auto: true, from: 'a', to: 'b', reasons: ['r'], ...extra }) as LogEntry;
    const log: LogEntry[] = [];
    for (let i = 0; i < 6; i++) {
      log.push(d('BREAK_FILL', T0 + i * 600_000));
      log.push(d('RETURN_HOME', T0 + i * 600_000 + (i < 4 ? 25_000 : 150_000)));
    }
    log.push(d('BREAK_FILL', T0 + 3_600_000, { duplicate: true }));
    const r = analyze([], log, cfg);
    expect(r.switching).toMatchObject({ fills: 7, quickReturns: 4, duplicates: 1, autoSwitches: 13 });
    expect(r.switching.screenHours).toBeCloseTo(1, 1);
    expect(r.suggestions.join(' ')).toMatch(/went back home within ~30 s/);
  });
});
