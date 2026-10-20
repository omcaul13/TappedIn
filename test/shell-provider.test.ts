import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { osPath, parseConfig } from '../src/config';
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
    expect(xoc.signin.windowTitle).toBe('TappedIn: sign in to Xfinity On Campus');
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

  it("YouTube TV's signed-out welcome page doesn't count as signed in", () => {
    const r = rules(shellProvider(loadProviderConfig('youtube-tv')));
    // "/\bSign in\b/" is the "/source/flags" form (case-sensitive), not a pattern with literal slashes.
    expect(r.signedOut('Try it free  Sign in')).toBe(true);
    // Signed out, /live sends you to the marketing page, whose text needn't say "Sign in".
    expect(r.isApp('https://tv.youtube.com/welcome/')).toBe(false);
    expect(r.signinDone([{ url: 'https://tv.youtube.com/welcome/?utm_source=x', bodyText: 'Live TV from 100+ channels. Try it free' }])).toBe(false);
    expect(r.signinDone([{ url: 'https://tv.youtube.com/live', bodyText: 'Home  Live  Library' }])).toBe(true);
    expect(r.isPlayer('https://tv.youtube.com/watch/niY10UGQat0')).toBe(true);
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

describe('shell requests and view names', async () => {
  const { markerTitle, revealAllowed, ReplyRouter } = await import('../src/shell');

  it('view titles carry the configure generation (none at startup, as before)', () => {
    expect(markerTitle('SCREEN', 1, 0)).toBe('RZ-SCREEN-1');
    expect(markerTitle('SPARE', 2, 0)).toBe('RZ-SPARE-2');
    expect(markerTitle('SCREEN', 3, 2)).toBe('RZ-SCREEN-3-g2');
  });

  it('only reveals files in the TappedIn exports folder or .state', () => {
    const docs = String.raw`C:\Users\me\OneDrive\Documents`;
    const state = String.raw`C:\code\redzone\.state`;
    const win = path.win32;
    expect(revealAllowed(String.raw`C:\Users\me\OneDrive\Documents\TappedIn\tappedin-sling.json`, docs, state, win)).toBe(true);
    expect(revealAllowed(String.raw`C:\code\redzone\.state\provider-check\a.png`, docs, state, win)).toBe(true);
    expect(revealAllowed(String.raw`C:\Windows\System32\cmd.exe`, docs, state, win)).toBe(false);
    expect(revealAllowed(String.raw`C:\Users\me\OneDrive\Documents\TappedIn\..\secrets.txt`, docs, state, win)).toBe(false);
  });

  it('on a Mac, only reveals files in ~/Documents/TappedIn or the Application Support .state', () => {
    const docs = '/Users/me/Documents';
    const state = '/Users/me/Library/Application Support/TappedIn/.state';
    const mac = path.posix;
    expect(revealAllowed('/Users/me/Documents/TappedIn/tappedin-sling.json', docs, state, mac)).toBe(true);
    expect(revealAllowed(`${state}/provider-check/a.png`, docs, state, mac)).toBe(true);
    expect(revealAllowed('/etc/passwd', docs, state, mac)).toBe(false);
    expect(revealAllowed('/Users/me/Documents/TappedIn/../secrets.txt', docs, state, mac)).toBe(false);
    expect(revealAllowed('/Users/me/Documents/TappedInOther/a.json', docs, state, mac)).toBe(false);
  });

  it('replies resolve only the matching request', async () => {
    const sent: { id: number; type: string }[] = [];
    const router = new ReplyRouter((m) => void sent.push(m as { id: number; type: string }));
    const a = router.request('logout', {}, 1000);
    const b = router.request('signin-check', {}, 1000);
    router.handle({ type: 'reply', id: sent[1].id, ok: true, data: { isApp: true } });
    await expect(b).resolves.toEqual({ isApp: true });
    router.handle({ type: 'reply', id: sent[0].id, ok: false, error: 'nope' });
    await expect(a).rejects.toThrow('nope');
  });

  it('a request with no reply times out', async () => {
    const router = new ReplyRouter(() => {});
    await expect(router.request('logout', {}, 20)).rejects.toThrow(/no reply/);
  });
});

describe('config paths per OS', () => {
  const file = String.raw`%LOCALAPPDATA%\TappedIn\electron`;

  it('Windows paths are expanded as before', () => {
    expect(osPath(file, 'win32', { LOCALAPPDATA: String.raw`C:\Users\me\AppData\Local` })).toBe(String.raw`C:\Users\me\AppData\Local\TappedIn\electron`);
  });

  it("on a Mac the config file's Windows paths land in Application Support", () => {
    expect(osPath(file, 'darwin', {}, '/Users/me')).toBe('/Users/me/Library/Application Support/TappedIn/electron');
    expect(osPath(String.raw`%LOCALAPPDATA%\TappedIn\chrome-profile`, 'darwin', {}, '/Users/me')).toBe('/Users/me/Library/Application Support/TappedIn/chrome-profile');
    expect(osPath('/Volumes/x/profile', 'darwin', {}, '/Users/me')).toBe('/Volumes/x/profile');
  });

  it.runIf(process.platform === 'darwin')('the Mac uses Chrome.app, not chrome.exe', () => {
    expect(parseConfig({}).chrome.executablePath).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });

  it.runIf(process.platform === 'win32')('Windows keeps chrome.exe', () => {
    expect(parseConfig({}).chrome.executablePath).toBe(String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`);
  });
});
