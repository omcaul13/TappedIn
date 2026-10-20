import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isNewer } = require('../electron/mac-updates.cjs') as { isNewer(a: string, b: string): boolean };

describe('Mac update check: is the site version newer?', () => {
  it('compares release numbers part by part', () => {
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('1.0', '1.0.0')).toBe(false);
    expect(isNewer('v0.1.1', '0.1.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
  });

  it('puts a prerelease before its release', () => {
    expect(isNewer('0.1.0', '0.1.0-beta.2')).toBe(true);
    expect(isNewer('0.1.0-beta.2', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0-beta.10', '0.1.0-beta.2')).toBe(true);
    expect(isNewer('0.1.0-beta.2', '0.1.0-beta.2')).toBe(false);
  });
});
