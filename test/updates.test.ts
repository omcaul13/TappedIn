import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isNewer } = require('../electron/updates.cjs') as { isNewer(a: string, b: string): boolean };

describe('update check: is the site version newer?', () => {
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

describe('new-version notice', () => {
  const { startUpdates } = require('../electron/updates.cjs');
  const run = async (platform: 'windows' | 'mac', siteVersion: string, button = 0) => {
    const asked: string[] = [];
    const opened: string[] = [];
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => (fetched.push(url), new Response(JSON.stringify({ version: siteVersion })))) as typeof fetch;
    try {
      const electron = { dialog: { showMessageBox: async (_w: unknown, o: { message: string; detail: string }) => (asked.push(`${o.message} | ${o.detail}`), { response: button }) }, shell: { openExternal: async (u: string) => void opened.push(u) } };
      await startUpdates({ mode: 'notice', platform, version: '0.1.4-beta.3', win: null, log: () => {}, electron });
    } finally {
      globalThis.fetch = realFetch;
    }
    return { asked, opened, fetched };
  };

  it('on Windows, offers the new installer from the site', async () => {
    const r = await run('windows', '0.1.4-beta.4');
    expect(r.fetched).toEqual(['https://tappedin-4ot.pages.dev/api/latest']);
    expect(r.asked[0]).toMatch(/^TappedIn 0\.1\.4-beta\.4 is available \| You have 0\.1\.4-beta\.3\. Download the new installer and run it/);
    expect(r.opened).toEqual(['https://tappedin-4ot.pages.dev/download/windows']);
  });

  it('on a Mac, reads the Mac version and links the disk image; nothing when up to date or "Later"', async () => {
    const mac = await run('mac', '0.1.4-beta.4');
    expect(mac.fetched).toEqual(['https://tappedin-4ot.pages.dev/api/latest?platform=mac']);
    expect(mac.opened).toEqual(['https://tappedin-4ot.pages.dev/download/mac']);
    expect((await run('windows', '0.1.4-beta.3')).asked).toEqual([]);
    expect((await run('windows', '0.1.4-beta.4', 1)).opened).toEqual([]);
  });
});
