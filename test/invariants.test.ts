import { describe, expect, it } from 'vitest';
import type { Decision } from '../src/engine/director';
import type { Engine, TickResult } from '../src/engine/engine';
import { InvariantChecker } from '../src/engine/invariants';
import { testConfig } from './helpers';

const engine = { director: { screens: [] } } as unknown as Engine;
const decision = (at: number, over: Partial<Decision>): Decision => ({ at, screen: 1, rule: 'RETURN_HOME', switched: true, auto: true, from: 'a', to: 'b', reasons: ['why'], ...over });
const tick = (d: Decision) => ({ decisions: [d], commands: [] }) as unknown as TickResult;

describe('invariant 2 (dwell)', () => {
  it('flags an automatic switch inside the dwell, but not one the director marks dwell-exempt', () => {
    const cfg = testConfig();
    const t = (s: number) => s * 1000;
    const c = new InvariantChecker(cfg);
    c.check(engine, tick(decision(t(0), {})), t(0));
    c.check(engine, tick(decision(t(5), { rule: 'AUTO_PICK', dwellExempt: true })), t(5));
    expect(c.violations).toEqual([]);
    c.check(engine, tick(decision(t(10), {})), t(10));
    expect(c.violations).toHaveLength(1);
  });
});
