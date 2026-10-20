import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { chromium, type Browser, type Page } from 'playwright-core';
import { PROJECT_ROOT, type Config } from './config';
import type { ProviderConfig } from './providers/types';

// Starts the one-window app shell (electron/main.cjs) and finds its video views over the local
// debugging port, so the window controller can drive them like the Chrome tiles. The shell knows
// nothing about any TV service: it reads the provider's shell settings from a JSON file written here.

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

/** How many video views the window has, and which configure generation made them. */
export interface ShellLayout {
  screens: number;
  spares: number;
  /** 0 at startup; +1 per configure (view titles carry it so a re-attach finds the new views). */
  generation: number;
}

export interface ShellOptions {
  provider: ProviderConfig;
  screens: number;
  spares: number;
  /** "defer": don't sign in yet (first-run setup signs in once a service is picked). */
  signin: 'now' | 'defer';
}

export interface Shell {
  /** Resolves once the service is signed in (or tried, or deferred) and the views exist. */
  ready: Promise<void>;
  /** The views as they are now. */
  readonly layout: ShellLayout;
  /** Run the sign-in again (e.g. after the service signed out). */
  handoff(): void;
  /** Show view `view` (S1..S4, X1..) in a screen's cell, on top. */
  present(screen: number, view: string): void;
  /** Per-screen fullscreen (`focus`, 0 = the grid) and the height above the grid (top bar or big ticker). Resizes views only. */
  setLayout(o: { focus: number; top: number }): void;
  /** Switch service, screen count or standby views in place: the window stays, its video views are rebuilt. */
  configure(o: ShellOptions): Promise<ShellLayout>;
  /** Forget the service's sign-in: clears this service's cookies and storage (its partition only). */
  logout(): Promise<void>;
  /** Load the service's check page in a hidden window and report what sign-in detection sees. */
  signinCheck(): Promise<{ url: string; isApp: boolean; signedOut: boolean }>;
  /** Show a file in Explorer (only RedZone exports and .state files). */
  reveal(file: string): Promise<void>;
  /** Folders Electron knows (Documents may be redirected to OneDrive). */
  paths(): Promise<{ documents: string }>;
  quit(): void;
}

const require = createRequire(import.meta.url);

/** The title a video view shows until it's tuned (the app finds the views by it). */
export function markerTitle(kind: 'SCREEN' | 'SPARE', n: number, generation: number): string {
  return `RZ-${kind}-${n}${generation ? `-g${generation}` : ''}`;
}

/** Explorer may only be pointed at RedZone's exports folder (Documents\RedZone) or .state. */
export function revealAllowed(file: string, documents: string, stateDir: string): boolean {
  const target = path.win32.resolve(file).toLowerCase();
  return [path.win32.join(documents, 'RedZone'), stateDir].some((dir) => {
    const d = path.win32.resolve(dir).toLowerCase();
    return target.startsWith(d + '\\');
  });
}

interface Reply {
  type: 'reply';
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Request/response over the shell's IPC channel: each request gets an id, and the matching reply settles it. */
export class ReplyRouter {
  private next = 1;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: NodeJS.Timeout }>();

  constructor(private readonly sendMessage: (msg: Record<string, unknown>) => void) {}

  request<T = unknown>(type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`no reply from the RedZone window to "${type}" within ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.sendMessage({ ...payload, type, id });
    });
  }

  handle(msg: Reply): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new Error(msg.error ?? 'the RedZone window refused'));
  }

  failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }
}
// Chromium chatter on stderr that isn't ours.
const NOISE = /^\[\d+:\d+:\d+\/\d+\.\d+:(INFO|WARNING|ERROR|VERBOSE\d?):|^DevTools listening|^\s*$/;

/** What electron/main.cjs needs to know about the service (passed as --provider=<file>). */
export interface ShellProvider {
  id: string;
  name: string;
  shortName: string;
  partition: string;
  userAgent: 'chrome' | 'default';
  appUrl: string;
  playerUrl: string;
  hideCss: string;
  hidePollMs: number;
  signin: ProviderConfig['signin'];
}

export function shellProvider(p: ProviderConfig): ShellProvider {
  return {
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    partition: p.shell.partition,
    userAgent: p.shell.userAgent,
    appUrl: p.shell.appUrl,
    playerUrl: p.shell.playerUrl,
    hideCss: p.shell.hideCss,
    hidePollMs: p.timing.hidePollMs,
    signin: p.signin,
  };
}

/** Write the shell provider file and return its path. */
export function writeShellProvider(p: ProviderConfig): string {
  const file = path.join(PROJECT_ROOT, '.state', 'shell-provider.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(shellProvider(p), null, 2));
  return file;
}

/** Standby views to create: a setting changed in the app or the config file wins, else the service's default. */
export function effectiveStandby(cfg: Config, provider: ProviderConfig): number {
  return cfg.electron.standbyViews ?? provider.defaults.standbyViews;
}

export async function startShell(cfg: Config, uiUrl: string, events: ShellEvents, opts: ShellOptions): Promise<Shell> {
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
    `--screens=${clampScreens(opts.screens)}`,
    `--spares=${clampSpares(opts.spares)}`,
    `--provider=${writeShellProvider(opts.provider)}`,
    ...(opts.signin === 'defer' ? ['--signin=defer'] : []),
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
  const router = new ReplyRouter((m) => {
    if (child.connected) child.send(m);
  });
  child.on('message', (msg: { type?: string; state?: SigninStatus['state']; detail?: string; text?: string }) => {
    if (msg?.type === 'signin' && msg.state) events.signin({ state: msg.state, detail: msg.detail ?? '' });
    else if (msg?.type === 'ready') markReady();
    else if (msg?.type === 'reply') router.handle(msg as unknown as Reply);
    else if (msg?.type === 'log' && msg.text) events.log(`shell: ${msg.text}`);
  });
  child.on('exit', (code) => {
    fail(new Error(`the RedZone window closed before it was ready (exit ${code})`));
    router.failAll(new Error('the RedZone window closed'));
    events.exit(code);
  });
  let layout: ShellLayout = { screens: clampScreens(opts.screens), spares: clampSpares(opts.spares), generation: 0 };
  const paths = () => router.request<{ documents: string }>('paths', {}, 5000);
  return {
    ready,
    get layout() {
      return layout;
    },
    handoff: () => child.connected && child.send({ type: 'handoff' }),
    present: (screen, view) => child.connected && child.send({ type: 'present', screen, view }),
    setLayout: (o) => child.connected && child.send({ type: 'layout', focus: o.focus, top: o.top }),
    configure: async (o) => {
      const file = writeShellProvider(o.provider);
      layout = await router.request<ShellLayout>('configure', { provider: file, screens: clampScreens(o.screens), spares: clampSpares(o.spares), signin: o.signin }, 30_000);
      return layout;
    },
    logout: () => router.request<void>('logout', {}, 15_000),
    signinCheck: () => router.request('signin-check', {}, 60_000),
    paths,
    reveal: async (file) => {
      const { documents } = await paths();
      if (!revealAllowed(file, documents, path.join(PROJECT_ROOT, '.state'))) throw new Error(`won't open ${file}: only RedZone exports can be shown`);
      await router.request('reveal', { file: path.win32.resolve(file) }, 5000);
    },
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

const clampScreens = (n: number) => Math.max(1, Math.min(4, Math.round(n) || 4));
const clampSpares = (n: number) => Math.max(0, Math.min(4, Math.round(n) || 0));

/** Attach to the shell and return its video views (found by their marker titles): screens in order, then spares. */
export async function attachShell(cfg: Config, layout: ShellLayout, timeoutMs = 30_000, browser?: Browser): Promise<{ browser: Browser; screens: ShellView[]; spares: ShellView[] }> {
  browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${cfg.electron.debugPort}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const byTitle = new Map<string, Page>();
    for (const c of browser.contexts()) for (const p of c.pages()) byTitle.set(await p.title().catch(() => ''), p);
    const screens = Array.from({ length: layout.screens }, (_, i) => ({ name: `S${i + 1}`, page: byTitle.get(markerTitle('SCREEN', i + 1, layout.generation)) }));
    const spares = Array.from({ length: layout.spares }, (_, i) => ({ name: `X${i + 1}`, page: byTitle.get(markerTitle('SPARE', i + 1, layout.generation)) }));
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
