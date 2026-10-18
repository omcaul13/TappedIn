import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { chromium, type Browser, type Page } from 'playwright-core';
import { PROJECT_ROOT, type Config } from './config';
import type { ProviderConfig } from './providers/types';

// Starts the one-window app shell (electron/main.cjs) and finds its Xfinity views over the local
// debugging port, so the window controller can drive them like the Chrome tiles.

export interface SigninStatus {
  state: 'signing-in' | 'needed' | 'ok' | 'failed';
  detail: string;
}

export interface ShellEvents {
  signin(s: SigninStatus): void;
  /** The window was closed (or the shell crashed). */
  exit(code: number | null): void;
  log(text: string): void;
}

export interface Shell {
  /** Resolves once Xfinity Stream is signed in (or tried) and the views exist. */
  ready: Promise<void>;
  /** Run the Xfinity On Campus "Watch Now" sign-in again (e.g. after Xfinity signed out). */
  handoff(): void;
  /** Show view `view` (S1..S4, X1..) in a screen's cell, on top. */
  present(screen: number, view: string): void;
  quit(): void;
}

const require = createRequire(import.meta.url);
// Chromium chatter on stderr that isn't ours.
const NOISE = /^\[\d+:\d+:\d+\/\d+\.\d+:(INFO|WARNING|ERROR|VERBOSE\d?):|^DevTools listening|^\s*$/;

/** Standby views to create: a setting changed in the app or the config file wins, else the service's default. */
export function effectiveStandby(cfg: Config, provider: ProviderConfig): number {
  return cfg.electron.standbyViews ?? provider.defaults.standbyViews;
}

export async function startShell(cfg: Config, uiUrl: string, events: ShellEvents, provider: ProviderConfig): Promise<Shell> {
  if (await debugPortOpen(cfg.electron.debugPort)) {
    throw new Error(`Something already uses port ${cfg.electron.debugPort} (an open RedZone window?). Close it and start again.`);
  }
  const electronPath = require('electron') as string;
  // Always --name=value: Electron exits at once on some space-separated values ("--screens 4").
  const args = [
    path.join(PROJECT_ROOT, 'electron', 'main.cjs'),
    `--port=${cfg.electron.debugPort}`,
    `--ui=${uiUrl}`,
    `--user-data=${cfg.electron.userDataDir}`,
    '--screens=4',
    `--spares=${effectiveStandby(cfg, provider)}`,
    ...(cfg.electron.disableDirectComposition ? ['--no-dcomp'] : []),
  ];
  // The app runs under tsx, whose NODE_OPTIONS loader would make Electron exit at once.
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const child: ChildProcess = spawn(electronPath, args, { cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: false });
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    createInterface({ input: stream }).on('line', (line) => {
      if (!NOISE.test(line)) events.log(`shell: ${line.slice(0, 300)}`);
    });
  }
  let markReady: () => void = () => {};
  let fail: (err: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    fail = reject;
  });
  child.on('message', (msg: { type?: string; state?: SigninStatus['state']; detail?: string; text?: string }) => {
    if (msg?.type === 'signin' && msg.state) events.signin({ state: msg.state, detail: msg.detail ?? '' });
    else if (msg?.type === 'ready') markReady();
    else if (msg?.type === 'log' && msg.text) events.log(`shell: ${msg.text}`);
  });
  child.on('exit', (code) => {
    fail(new Error(`the RedZone window closed before it was ready (exit ${code})`));
    events.exit(code);
  });
  return {
    ready,
    handoff: () => child.connected && child.send({ type: 'handoff' }),
    present: (screen, view) => child.connected && child.send({ type: 'present', screen, view }),
    quit: () => {
      if (child.connected) child.send({ type: 'quit' });
      setTimeout(() => child.exitCode === null && child.kill(), 3000).unref();
    },
  };
}

/** A view of the app window: its shell name (S1..S4, X1..) and its page. */
export interface ShellView {
  name: string;
  page: Page;
}

/** Attach to the shell and return its Xfinity views (found by their marker titles): screens in order, then spares. */
export async function attachShell(cfg: Config, count: number, provider: ProviderConfig, timeoutMs = 30_000): Promise<{ browser: Browser; screens: ShellView[]; spares: ShellView[] }> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cfg.electron.debugPort}`);
  const deadline = Date.now() + timeoutMs;
  const spareCount = effectiveStandby(cfg, provider);
  while (Date.now() < deadline) {
    const byTitle = new Map<string, Page>();
    for (const c of browser.contexts()) for (const p of c.pages()) byTitle.set(await p.title().catch(() => ''), p);
    const screens = Array.from({ length: count }, (_, i) => ({ name: `S${i + 1}`, page: byTitle.get(`RZ-SCREEN-${i + 1}`) }));
    const spares = Array.from({ length: spareCount }, (_, i) => ({ name: `X${i + 1}`, page: byTitle.get(`RZ-SPARE-${i + 1}`) }));
    if ([...screens, ...spares].every((v) => v.page)) return { browser, screens: screens as ShellView[], spares: spares as ShellView[] };
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('could not find the RedZone window\'s video views');
}

async function debugPortOpen(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}
