import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/config';
import { SPORT_IDS } from '../src/sports';

// The website is plain JS (no types); a non-literal import() keeps typecheck out of it.
const site = (file: string) => import(path.join(PROJECT_ROOT, 'website', file));

describe('website build', async () => {
  const { build, loadServices } = await site('build.mjs');
  const out = mkdtempSync(path.join(tmpdir(), 'tappedin-site-'));
  build({ out });
  afterAll(() => rmSync(out, { recursive: true, force: true }));
  const page = (f: string) => readFileSync(path.join(out, f), 'utf8');

  it('lists every shipped TV service with its status', () => {
    const html = page('index.html');
    const services = loadServices();
    expect(services.length).toBe(readdirSync(path.join(PROJECT_ROOT, 'config', 'providers')).filter((f) => f.endsWith('.json')).length);
    for (const p of services) {
      expect(html).toContain(`<strong>${p.name}</strong><span class="badge badge-${p.status}">`);
    }
    expect(services[0].status).toBe('stable');
  });

  it('fills every placeholder on every page, including the shared nav and footer', () => {
    for (const f of ['index.html', 'install.html', 'fix-your-service.html']) {
      const html = page(f);
      expect(html, f).not.toMatch(/\{\{\w+\}\}/);
      expect(html, f).toContain('data-nav-download');
      expect(html, f).toContain('isn\'t affiliated with');
      expect(html, f).toContain('href="mailto:');
    }
  });

  it('links both platforms on the home page, with the static Mac requirement as the fallback', () => {
    const html = page('index.html');
    expect(html).toContain('href="/download/mac"');
    expect(html).toContain('href="/download/windows"');
    expect(html).toContain('<span data-latest-mac>Requires macOS 13 or later, Apple Silicon or Intel</span>');
    expect(page('install.html')).toContain('<section data-unsigned-mac>');
  });

  it("covers exactly the app's sports", () => {
    const groups = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'website', 'sports.json'), 'utf8')) as { leagues: { id: string }[] }[];
    expect(groups.flatMap((g) => g.leagues.map((l) => l.id)).sort()).toEqual([...SPORT_IDS].sort());
  });

  it('fills the sport and league counts on the home page from sports.json', () => {
    const groups = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'website', 'sports.json'), 'utf8')) as { family: string; leagues: unknown[] }[];
    const families = new Set(groups.map((g) => g.family)).size;
    const leagues = groups.reduce((n, g) => n + g.leagues.length, 0);
    const html = page('index.html');
    expect(html).toContain(`<b data-count="${families}">${families}</b><span>sports`);
    expect(html).toContain(`<b data-count="${leagues}">${leagues}</b><span>leagues`);
  });

  it('never uses the old name or calls itself a red zone channel', () => {
    for (const f of ['index.html', 'install.html', 'fix-your-service.html']) {
      expect(page(f), f).not.toMatch(/redzone|red zone channel/i);
    }
  });
});

describe('scroll story', async () => {
  const { sceneProgress, stepAt, stepScrollY } = await site('src/scroll.js');

  it('runs a tall scene from its top at the top to its bottom at the bottom', () => {
    expect(sceneProgress(100, 3000, 1000)).toBe(0); // not reached yet
    expect(sceneProgress(0, 3000, 1000)).toBe(0);
    expect(sceneProgress(-1000, 3000, 1000)).toBe(0.5);
    expect(sceneProgress(-2000, 3000, 1000)).toBe(1);
    expect(sceneProgress(-5000, 3000, 1000)).toBe(1); // past it
  });

  it('runs a scene no taller than the viewport while it scrolls out, and never divides by zero', () => {
    expect(sceneProgress(64, 800, 1000)).toBe(0);
    expect(sceneProgress(-400, 800, 1000)).toBe(0.5);
    expect(sceneProgress(-900, 800, 1000)).toBe(1);
    expect(sceneProgress(-400, 1000, 1000)).toBe(0.4);
    expect(sceneProgress(1, 0, 1000)).toBe(0);
    expect(sceneProgress(0, 0, 1000)).toBe(1);
  });

  it('picks the step, holding the last one through the end', () => {
    expect(stepAt(0, 4)).toBe(0);
    expect(stepAt(0.249, 4)).toBe(0);
    expect(stepAt(0.25, 4)).toBe(1);
    expect(stepAt(0.99, 4)).toBe(3);
    expect(stepAt(1, 4)).toBe(3);
    expect(stepAt(1, 1)).toBe(0);
  });

  it('jumps to the middle of a step, and the step there is the one asked for', () => {
    // A 4-step scene at y=2000, 5000 px tall, 1000 px viewport: 4000 px of run, 1000 per step.
    expect(stepScrollY(0, 4, 2000, 5000, 1000)).toBe(2500);
    expect(stepScrollY(3, 4, 2000, 5000, 1000)).toBe(5500);
    for (let i = 0; i < 4; i++) {
      const y = stepScrollY(i, 4, 2000, 5000, 1000);
      expect(stepAt(sceneProgress(2000 - y, 5000, 1000), 4)).toBe(i);
    }
  });
});

describe('download button', async () => {
  const { pickPlatform, metaLine, macMetaLine, MAC_FALLBACK } = await site('src/download.js');

  it('picks the platform from the browser hints', () => {
    const ua = {
      windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    };
    expect(pickPlatform({ userAgent: ua.windows, platform: 'Win32' })).toBe('windows');
    expect(pickPlatform({ userAgent: ua.windows, platform: 'Windows' })).toBe('windows');
    expect(pickPlatform({ userAgent: ua.mac, platform: 'MacIntel' })).toBe('mac');
    expect(pickPlatform({ userAgent: ua.mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('mobile'); // iPad
    expect(pickPlatform({ userAgent: ua.linux, platform: 'Linux x86_64' })).toBe('other');
    expect(pickPlatform({ userAgent: ua.iphone, platform: 'iPhone' })).toBe('mobile');
    expect(pickPlatform({ userAgent: ua.android, platform: 'Linux armv8l' })).toBe('mobile');
    expect(pickPlatform({ userAgent: 'x', platform: 'Android', mobile: true })).toBe('mobile');
    expect(pickPlatform()).toBe('other');
  });

  it('shows version, date and size only for a well-formed latest.json', () => {
    expect(metaLine({ version: '0.1.0-beta.1', date: '2026-10-20', size: 164546115 })).toBe('Version 0.1.0-beta.1 · Oct 20, 2026 · 157 MB');
    expect(metaLine(null)).toBeNull();
    expect(metaLine({ version: '1', date: 'yesterday', size: 1 })).toBeNull();
    expect(metaLine({ version: '1', date: '2026-10-20', size: '1' })).toBeNull();
  });

  it('shows the Mac version, size and requirement, or the static requirement when latest-mac.json is missing or odd', () => {
    expect(macMetaLine({ version: '0.1.0-beta.2', date: '2026-10-20', size: 209715200, minimumSystemVersion: '13.0' })).toBe(
      'Version 0.1.0-beta.2 · 200 MB · Requires macOS 13.0 or later, Apple Silicon or Intel',
    );
    expect(MAC_FALLBACK).toBe('Requires macOS 13 or later, Apple Silicon or Intel');
    expect(macMetaLine(null)).toBe(MAC_FALLBACK);
    expect(macMetaLine({ error: 'No release has been published yet.' })).toBe(MAC_FALLBACK);
    expect(macMetaLine({ version: '1', size: 1, minimumSystemVersion: '<b>12</b>' })).toBe(MAC_FALLBACK);
    expect(macMetaLine({ version: '1', size: '1', minimumSystemVersion: '13.0' })).toBe(MAC_FALLBACK);
  });
});

describe('release notes', async () => {
  const { cleanNotes } = await site('release-info.mjs');

  it('keeps one plain line per change, without usernames or links', () => {
    const body = [
      "## What's Changed",
      '* Support more TV services: provider adapters by @someone in https://github.com/o/r/pull/1',
      '* fix(server): a request that throws no longer crashes the app by @other-user in https://github.com/o/r/pull/9',
      '- feat!: new look',
      '',
      '**Full Changelog**: https://github.com/o/r/commits/v0.1.0',
    ].join('\r\n');
    expect(cleanNotes(body)).toEqual(['Support more TV services: provider adapters', 'A request that throws no longer crashes the app', 'New look']);
    expect(cleanNotes('')).toEqual([]);
  });
});

describe('download functions', async () => {
  const { onRequest, parseRange } = await site('functions/download/windows.js');
  const { onRequest: mac } = await site('functions/download/mac.js');
  const { onRequest: macZip } = await site('functions/download/mac-zip.js');
  const { onRequestGet: latest } = await site('functions/api/latest.js');
  const { onRequestGet: macUpdate, compareVersions } = await site('functions/api/update/mac/[version].js');
  const exe = 'MZ0123456789';
  const dmg = 'koly-0123456789abcdef';
  const latestJson = JSON.stringify({ version: '0.1.0-beta.1', date: '2026-10-20', size: exe.length, notes: [] });
  const latestMacJson = JSON.stringify({ version: '0.1.0-beta.2', date: '2026-10-21', size: dmg.length, notes: ['Mac version'], minimumSystemVersion: '13.0' });
  const allFiles = { 'TappedIn-Setup.exe': exe, 'latest.json': latestJson, 'TappedIn.dmg': dmg, 'TappedIn-mac.zip': 'PK0123', 'latest-mac.json': latestMacJson };

  /** A stand-in for the R2 binding with every release object, or only what's given. */
  function bucket(files: Record<string, string> = allFiles) {
    const obj = (key: string, body: string) => ({ size: files[key].length, httpEtag: `"etag-${key}"`, body, json: async () => JSON.parse(body) });
    return {
      head: async (key: string) => (key in files ? obj(key, '') : null),
      get: async (key: string, opts?: { range?: { offset: number; length: number } }) => {
        if (!(key in files)) return null;
        const r = opts?.range;
        return obj(key, r ? files[key].slice(r.offset, r.offset + r.length) : files[key]);
      },
    };
  }
  const call = (init: RequestInit & { url?: string } = {}, env = { DOWNLOADS: bucket() }) =>
    onRequest({ request: new Request('https://tappedin.pages.dev/download/windows', init), env });
  const req = (url: string, init?: RequestInit) => new Request(`https://tappedin.pages.dev${url}`, init);

  it('serves the whole installer under its versioned name', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="TappedIn-Setup-0.1.0-beta.1.exe"');
    expect(res.headers.get('content-length')).toBe(String(exe.length));
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe(exe);
  });

  it('resumes with a range, and starts over when the installer changed', async () => {
    const part = await call({ headers: { range: 'bytes=2-5' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 2-5/${exe.length}`);
    expect(await part.text()).toBe('0123');
    const changed = await call({ headers: { range: 'bytes=2-', 'if-range': '"an-older-etag"' } });
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe(exe);
    expect((await call({ headers: { range: `bytes=${exe.length}-` } })).status).toBe(416);
  });

  it('answers HEAD, refuses other methods, and says when there is nothing to download', async () => {
    const head = await call({ method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(exe.length));
    expect((await call({ method: 'POST' })).status).toBe(405);
    expect((await call({}, { DOWNLOADS: bucket({}) })).status).toBe(503);
    const noMeta = await call({}, { DOWNLOADS: bucket({ 'TappedIn-Setup.exe': exe }) });
    expect(noMeta.headers.get('content-disposition')).toBe('attachment; filename="TappedIn-Setup.exe"');
  });

  it('parses ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ offset: 0, length: 100 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ offset: 0, length: 1000 });
    expect(parseRange('bytes=1000-', 1000)).toBe(false);
    expect(parseRange('bytes=-0', 1000)).toBe(false);
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });

  it('passes latest.json through, or 404s before the first release', async () => {
    const ok = await latest({ request: req('/api/latest'), env: { DOWNLOADS: bucket() } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: '0.1.0-beta.1' });
    expect((await latest({ request: req('/api/latest'), env: { DOWNLOADS: bucket({}) } })).status).toBe(404);
    const forMac = await latest({ request: req('/api/latest?platform=mac'), env: { DOWNLOADS: bucket() } });
    expect(await forMac.json()).toMatchObject({ version: '0.1.0-beta.2', minimumSystemVersion: '13.0' });
    expect((await latest({ request: req('/api/latest?platform=mac'), env: { DOWNLOADS: bucket({ 'latest.json': latestJson }) } })).status).toBe(404);
  });

  it('serves the Mac disk image and update zip with the same shared streaming', async () => {
    const env = { DOWNLOADS: bucket() };
    const whole = await mac({ request: req('/download/mac'), env });
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('application/x-apple-diskimage');
    expect(whole.headers.get('content-disposition')).toBe('attachment; filename="TappedIn-0.1.0-beta.2.dmg"');
    expect(await whole.text()).toBe(dmg);
    const part = await mac({ request: req('/download/mac', { headers: { range: 'bytes=-4' } }), env });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes ${dmg.length - 4}-${dmg.length - 1}/${dmg.length}`);
    expect(await part.text()).toBe('cdef');
    expect((await mac({ request: req('/download/mac', { headers: { range: 'bytes=999-' } }), env })).status).toBe(416);
    expect((await mac({ request: req('/download/mac'), env: { DOWNLOADS: bucket({ 'TappedIn-Setup.exe': exe }) } })).status).toBe(503);
    const noMeta = await mac({ request: req('/download/mac'), env: { DOWNLOADS: bucket({ 'TappedIn.dmg': dmg }) } });
    expect(noMeta.headers.get('content-disposition')).toBe('attachment; filename="TappedIn.dmg"');
    const zip = await macZip({ request: req('/download/mac-zip'), env });
    expect(zip.headers.get('content-type')).toBe('application/zip');
    expect(await zip.text()).toBe('PK0123');
    expect((await macZip({ request: req('/download/mac-zip'), env: { DOWNLOADS: bucket({}) } })).status).toBe(503);
  });

  it('compares versions for the Mac update feed', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0-beta.1', '0.1.0')).toBeLessThan(0);
    expect(compareVersions('0.1.0', '0.1.0-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0-beta.2', '0.1.0-beta.10')).toBeLessThan(0);
    expect(compareVersions('0.1.0-beta.2', '0.1.0-beta.2')).toBe(0);
  });

  it('answers the Mac update feed: 204 when current, the zip when older', async () => {
    const env = { DOWNLOADS: bucket() };
    const feed = (version: string, e = env) => macUpdate({ request: req(`/api/update/mac/${version}`), env: e, params: { version } });
    expect((await feed('0.1.0-beta.2')).status).toBe(204);
    expect((await feed('0.1.0')).status).toBe(204);
    expect((await feed('0.2.0')).status).toBe(204);
    const older = await feed('0.1.0-beta.1');
    expect(older.status).toBe(200);
    expect(await older.json()).toEqual({
      url: 'https://tappedin.pages.dev/download/mac-zip',
      name: '0.1.0-beta.2',
      notes: 'Mac version',
      pub_date: '2026-10-21T00:00:00Z',
    });
    expect((await feed('0.0.1', { DOWNLOADS: bucket({}) })).status).toBe(204);
  });
});
