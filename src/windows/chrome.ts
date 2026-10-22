import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Config } from '../config';

// We launch the user's installed Chrome ourselves (no Playwright launch flags such as
// --enable-automation / --disable-component-update) and only attach over CDP afterwards.
// Chrome 136+ refuses remote debugging on the default profile, so the profile is dedicated.

export function chromeArgs(cfg: Config): string[] {
  return [
    `--user-data-dir=${cfg.chrome.profileDir}`,
    `--remote-debugging-port=${cfg.chrome.debugPort}`,
    // Let channel changes start playing (with sound) without a click.
    '--autoplay-policy=no-user-gesture-required',
    // Keep all four tiles decoding even when the control panel covers part of one.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

export interface VersionInfo {
  Browser: string;
  webSocketDebuggerUrl: string;
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const endpoint = (cfg: Config) => `http://127.0.0.1:${cfg.chrome.debugPort}`;

export async function debugEndpoint(cfg: Config): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`${endpoint(cfg)}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? ((await res.json()) as VersionInfo) : null;
  } catch {
    return null;
  }
}

function spawnChrome(cfg: Config, args: string[]): void {
  if (!existsSync(cfg.chrome.executablePath)) {
    if (process.platform === 'darwin') throw new Error(`Google Chrome is not installed (no ${cfg.chrome.executablePath}). Install it from https://www.google.com/chrome/ into Applications, or set chrome.executablePath in config/tappedin.config.json5.`);
    throw new Error(`Chrome not found at ${cfg.chrome.executablePath}. Fix chrome.executablePath in config/tappedin.config.json5.`);
  }
  spawn(cfg.chrome.executablePath, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

/** Start TappedIn Chrome if it isn't already running with the debug port open. */
export async function ensureChrome(cfg: Config, startUrls: string[] = []): Promise<{ launched: boolean; version: VersionInfo }> {
  const existing = await debugEndpoint(cfg);
  if (existing) return { launched: false, version: existing };
  spawnChrome(cfg, [...chromeArgs(cfg), ...startUrls]);
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const v = await debugEndpoint(cfg);
    if (v) return { launched: true, version: v };
  }
  throw new Error(
    `Chrome did not open its debug port ${cfg.chrome.debugPort}. If a TappedIn Chrome window (profile ${cfg.chrome.profileDir}) is already open ` +
      `without remote debugging, close it and try again.`,
  );
}

/** Open a URL in a new tab of the running TappedIn Chrome without attaching to any page. */
export async function openTabNoAttach(cfg: Config, url: string): Promise<void> {
  await fetch(`${endpoint(cfg)}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(3000) });
}

export async function connect(cfg: Config): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.connectOverCDP(endpoint(cfg));
  const context = browser.contexts()[0];
  if (!context) throw new Error('Connected to Chrome but found no default browser context.');
  return { browser, context };
}

/** A blank local page we can recognise after the window opens. */
export function markerUrl(label: string): string {
  const html = `<title>${label}</title><body style="margin:0;background:#0b1a12;color:#a8b8a2;font:600 22px system-ui;display:grid;place-items:center;height:100vh">${label}</body>`;
  return `data:text/html,${encodeURIComponent(html)}`;
}

/**
 * Open a new top-level window and return its Page.
 * app=true uses Chrome's --app mode (no tab strip / address bar → more pixels for video).
 */
export async function openWindow(cfg: Config, browser: Browser, context: BrowserContext, label: string, app: boolean): Promise<Page> {
  const url = markerUrl(label);
  const found = context.waitForEvent('page', { predicate: (p) => p.url() === url, timeout: 15000 });
  if (app) {
    spawnChrome(cfg, [`--user-data-dir=${cfg.chrome.profileDir}`, `--app=${url}`]);
  } else {
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Target.createTarget', { url, newWindow: true });
    await cdp.detach();
  }
  return found;
}

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function setWindowBounds(page: Page, bounds: Bounds): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = (await cdp.send('Browser.getWindowForTarget')) as { windowId: number };
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await cdp.send('Browser.setWindowBounds', { windowId, bounds });
  await cdp.detach();
}

/** Screen work area in CSS/DIP pixels, as Chrome sees it (already accounts for Windows display scaling). */
export async function workArea(page: Page): Promise<Bounds & { dpr: number }> {
  return page.evaluate('({ left: screen.availLeft, top: screen.availTop, width: screen.availWidth, height: screen.availHeight, dpr: devicePixelRatio })');
}

export function gridBounds(area: Bounds, cols = 2, rows = 2): Bounds[] {
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);
  const out: Bounds[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ left: area.left + c * w, top: area.top + r * h, width: w, height: h });
  return out;
}
