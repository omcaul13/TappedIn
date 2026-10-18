import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';
import { loadProviderConfig } from '../src/providers/registry';
import { effectiveStandby, shellProvider, type ShellProvider } from '../src/shell';

const require = createRequire(import.meta.url);
const { rules } = require('../electron/signin-rules.cjs') as { rules(sp: ShellProvider): { isApp(u: string): boolean; isPlayer(u: string): boolean; signedOut(t: string): boolean; signinDone(w: { url: string; bodyText: string }[]): boolean } };

const xocConfig = loadProviderConfig('xfinity-on-campus');
const xoc = shellProvider(xocConfig);

describe('shell provider for the Electron window', () => {
  it("XOC shell provider equals today's constants", () => {
    expect(xoc.partition).toBe('persist:xfinity');
    expect(xoc.userAgent).toBe('chrome');
    expect(xoc.hidePollMs).toBe(500);
    expect(xoc.signin.checkUrl).toBe('https://www.xfinity.com/stream/');
    expect(xoc.signin.portalUrl).toBe('https://www.xfinityoncampus.com/');
    expect(xoc.signin.autoClick).toEqual({ selector: 'a.watch-now-btn', text: 'watch now' });
    expect(xoc.signin).toMatchObject({ checkTimeoutMs: 20000, portalTimeoutMs: 30000, checkSettleMs: 4000, handoffSettleMs: 5000, autoClickTries: 30, autoClickIntervalMs: 500, waitAfterClickMs: 40000, waitForUserMs: 600000 });
    expect(xoc.signin.windowTitle).toBe('RedZone: sign in to Xfinity On Campus');
  });

  it('XOC page rules match what main.cjs hard-coded', () => {
    const r = rules(xoc);
    expect(r.isApp('https://www.xfinity.com/stream/listings')).toBe(true);
    expect(r.isApp('https://www.xfinityoncampus.com/')).toBe(false);
    expect(r.isPlayer('https://www.xfinity.com/stream/live/a/1/ESPND')).toBe(true);
    expect(r.isPlayer('https://www.xfinity.com/stream/listings')).toBe(false);
    // Case-sensitive like the original /\bSign In\b/: "sign in" in a menu doesn't count.
    expect(r.signedOut('Welcome. Sign In to continue')).toBe(true);
    expect(r.signedOut('Live TV  For You  sign in help')).toBe(false);
    expect(r.signedOut(`${'x'.repeat(4000)} Sign In`)).toBe(false);
  });

  it('signinDone checks every window', () => {
    const r = rules(xoc);
    expect(r.signinDone([{ url: 'https://idp.school.edu/sso', bodyText: '' }, { url: 'https://www.xfinity.com/stream/', bodyText: 'Live TV' }])).toBe(true);
    expect(r.signinDone([{ url: 'https://idp.school.edu/sso', bodyText: '' }, { url: 'https://www.xfinity.com/stream/', bodyText: 'Sign In' }])).toBe(false);
    expect(r.signinDone([])).toBe(false);
  });

  it('effective standby resolution', () => {
    const provider = { ...xocConfig, defaults: { standbyViews: 0 } };
    expect(effectiveStandby(parseConfig({ electron: { standbyViews: 2 } }), provider)).toBe(2);
    expect(effectiveStandby(parseConfig({}), provider)).toBe(0);
    expect(effectiveStandby(parseConfig({}), { ...provider, defaults: { standbyViews: 1 } })).toBe(1);
  });
});
