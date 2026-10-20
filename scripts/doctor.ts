// Checks a TappedIn install and names a one-line fix for each problem. Read-only: it never installs,
// signs or changes anything.
//   npm run doctor [-- --deps]
// Exit code 0 when every check passes, 1 otherwise. The check* functions are pure (test/doctor.test.ts);
// main() gathers the facts they judge.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadOverrides, parseConfig, PROJECT_ROOT, withOverrides, type Config } from '../src/config';
import { EspnClient, espnDateKey } from '../src/espn/client';
import { loadProviderConfig } from '../src/providers/registry';

export interface CheckResult {
  ok: boolean;
  title: string;
  /** One line telling a non-technical user what to do. Empty when ok. */
  fix: string;
}

const SETUP = 'double-click "Setup TappedIn.cmd"';

export function nodeMajor(version: string): number | null {
  const m = /^v?(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : null;
}

export function checkNode(version: string): CheckResult {
  const major = nodeMajor(version);
  const v = version.replace(/^v/, '');
  if (major !== null && major >= 22) return { ok: true, title: `Node ${v}`, fix: '' };
  return { ok: false, title: `Node ${v} is too old (TappedIn needs 22 or later)`, fix: `Install Node 22 or later from https://nodejs.org/ (or ${SETUP}), then try again.` };
}

/** `installed` is node_modules/electron/package.json's version, or null when Electron isn't installed. */
export function checkEcsElectron(installed: string | null): CheckResult {
  if (installed === null) return { ok: false, title: 'Electron is not installed', fix: `${SETUP}, or run npm ci.` };
  if (installed.includes('+wvcus')) return { ok: true, title: `castLabs Electron ${installed} (with Widevine)`, fix: '' };
  return {
    ok: false,
    title: `Electron ${installed} is the standard build, not castLabs' (no Widevine, so no video)`,
    fix: "Run npm ci to install the castLabs build that package.json names.",
  };
}

export interface SignatureFacts {
  exeMtimeMs: number | null;
  sigMtimeMs: number | null;
  /** castLabs' verify-pkg said the signature is development-only (null: couldn't check, no .venv-evs). */
  development?: boolean | null;
}

export type SignatureState = 'ok' | 'missing' | 'stale' | 'no-electron' | 'development';

export function signatureState(f: SignatureFacts): SignatureState {
  if (f.exeMtimeMs === null) return 'no-electron';
  if (f.sigMtimeMs === null) return 'missing';
  if (f.sigMtimeMs < f.exeMtimeMs) return 'stale';
  return f.development ? 'development' : 'ok';
}

export function checkSignature(f: SignatureFacts): CheckResult {
  const fix = `${SETUP}, or run npm run sign-electron (uploads electron.exe to castLabs' free EVS service).`;
  switch (signatureState(f)) {
    case 'ok':
      return { ok: true, title: 'Electron is signed for Widevine streaming', fix: '' };
    case 'missing':
      return { ok: false, title: 'Electron is not signed for Widevine (no electron.exe.sig), so video will not play', fix };
    case 'stale':
      return { ok: false, title: 'The Widevine signature is older than electron.exe (Electron was reinstalled or updated)', fix };
    case 'development':
      return { ok: false, title: "Electron has only castLabs' development signature (the one it ships with), so video will not play", fix };
    case 'no-electron':
      return { ok: false, title: 'Electron binary not downloaded (no electron.exe)', fix: `${SETUP}, or run node node_modules\\electron\\install.js.` };
  }
}

/** `load` loads the provider config and reports override warnings through `warn`; it throws when it can't load. */
export function checkProviderConfig(id: string, load: (warn: (msg: string) => void) => void): CheckResult {
  const warnings: string[] = [];
  try {
    load((m) => warnings.push(m));
  } catch (err) {
    return { ok: false, title: `TV service "${id}" config does not load`, fix: firstLine(err) };
  }
  if (warnings.length === 0) return { ok: true, title: `TV service config "${id}" is valid`, fix: '' };
  return {
    ok: false,
    title: `TV service "${id}": your fixes in .state/providers/${id}.json are partly ignored`,
    fix: `${warnings.join(' | ')} (fix or delete .state/providers/${id}.json)`,
  };
}

/** `text` is .state/setup.json's contents, or null when the file doesn't exist. */
export function checkSetupState(text: string | null): CheckResult {
  if (text === null) return { ok: true, title: 'Not set up yet: the first start opens the setup screens', fix: '' };
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, title: 'Setup state (.state/setup.json) is readable', fix: '' };
  } catch {
    // fall through
  }
  return { ok: false, title: '.state/setup.json is damaged', fix: 'Delete .state/setup.json; the next start runs setup again.' };
}

export function checkPorts(ports: { port: number; free: boolean }[]): CheckResult {
  const busy = ports.filter((p) => !p.free).map((p) => p.port);
  if (busy.length === 0) return { ok: true, title: `Ports ${ports.map((p) => p.port).join(' and ')} are free`, fix: '' };
  return {
    ok: false,
    title: `Port ${busy.join(' and ')} is in use`,
    fix: 'TappedIn is probably already running: close it (or end electron.exe in Task Manager) and try again. Otherwise change electron.debugPort / server.port in config/tappedin.config.json5.',
  };
}

export function checkEspn(r: { status: number } | { error: string }): CheckResult {
  if ('status' in r && r.status === 200) return { ok: true, title: 'ESPN scoreboard is reachable', fix: '' };
  const why = 'status' in r ? `HTTP ${r.status}` : r.error;
  return { ok: false, title: `ESPN scoreboard is not reachable (${why})`, fix: 'Check your internet connection. If it works in a browser, ESPN may be down; try again in a few minutes.' };
}

type LockPackages = Record<string, { version?: string; integrity?: string; optional?: boolean }>;

function lockPackages(text: string): LockPackages {
  const v = JSON.parse(text) as { packages?: LockPackages };
  return v.packages ?? {};
}

/**
 * Whether node_modules matches package-lock.json. `hidden` is node_modules/.package-lock.json (npm's
 * record of what it installed), or null without node_modules. Optional packages for other platforms
 * (esbuild's) are in the lockfile but never installed.
 */
export function checkDependencies(lock: string, hidden: string | null): CheckResult {
  const fix = `${SETUP}, or run npm ci.`;
  if (hidden === null) return { ok: false, title: 'Dependencies are not installed (no node_modules)', fix };
  let want: LockPackages;
  let have: LockPackages;
  try {
    want = lockPackages(lock);
    have = lockPackages(hidden);
  } catch (err) {
    return { ok: false, title: `Can't read the lockfiles (${firstLine(err)})`, fix };
  }
  const name = (k: string) => k.replace(/^.*node_modules\//, '');
  const off: string[] = [];
  for (const [key, w] of Object.entries(want)) {
    if (key === '') continue;
    const h = have[key];
    if (!h) {
      if (!w.optional) off.push(`${name(key)} missing`);
    } else if (h.version !== w.version || (h.integrity && w.integrity && h.integrity !== w.integrity)) {
      off.push(`${name(key)} ${h.version} (wants ${w.version})`);
    }
  }
  if (off.length === 0) return { ok: true, title: 'Dependencies match package-lock.json', fix: '' };
  const shown = off.slice(0, 3).join(', ') + (off.length > 3 ? ` and ${off.length - 3} more` : '');
  return { ok: false, title: `Dependencies don't match package-lock.json: ${shown}`, fix };
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0];
}

function mtime(file: string): number | null {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function electronVersion(root = PROJECT_ROOT): string | null {
  const text = readText(path.join(root, 'node_modules', 'electron', 'package.json'));
  if (text === null) return null;
  try {
    return String(JSON.parse(text).version ?? '') || null;
  } catch {
    return null;
  }
}

export function signatureFacts(root = PROJECT_ROOT): SignatureFacts {
  const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const facts: SignatureFacts = { exeMtimeMs: mtime(exe), sigMtimeMs: mtime(`${exe}.sig`) };
  // castLabs ships electron.exe.sig signed for development only; only their verifier can tell it apart.
  const venvPython = path.join(root, '.venv-evs', 'Scripts', 'python.exe');
  if (facts.sigMtimeMs !== null && mtime(venvPython) !== null) {
    const r = spawnSync(venvPython, ['-I', path.join(root, 'scripts', 'evs.py'), 'vmp', '-n', 'verify-pkg', path.dirname(exe)], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    facts.development = r.status === 0 ? false : /development/i.test(`${r.stdout}${r.stderr}`) ? true : null;
  }
  return facts;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen({ port, host: '127.0.0.1', exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

async function probeEspn(cfg: Config): Promise<{ status: number } | { error: string }> {
  const url = new EspnClient(cfg.espn).scoreboardUrl(espnDateKey());
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(cfg.espn.requestTimeoutMs), headers: { accept: 'application/json' } });
    return { status: res.status };
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    return { error: cause ? `${firstLine(err)}: ${firstLine(cause)}` : firstLine(err) };
  }
}

export function dependencyCheck(root = PROJECT_ROOT): CheckResult {
  return checkDependencies(readText(path.join(root, 'package-lock.json')) ?? '{}', readText(path.join(root, 'node_modules', '.package-lock.json')));
}

export async function runDoctor(root = PROJECT_ROOT): Promise<CheckResult[]> {
  const results: CheckResult[] = [
    checkNode(process.version),
    dependencyCheck(root),
    checkEcsElectron(electronVersion(root)),
    checkSignature(signatureFacts(root)),
  ];

  let cfg: Config;
  try {
    cfg = withOverrides(loadConfig(), loadOverrides());
  } catch (err) {
    results.push({ ok: false, title: 'config/tappedin.config.json5 or .state/settings.json is invalid', fix: firstLine(err) });
    cfg = parseConfig({});
  }
  results.push(checkProviderConfig(cfg.provider, (warn) => void loadProviderConfig(cfg.provider, { onWarning: warn })));
  results.push(checkSetupState(readText(path.join(root, '.state', 'setup.json'))));
  const ports = [cfg.electron.debugPort, cfg.server.port];
  results.push(checkPorts(await Promise.all(ports.map(async (port) => ({ port, free: await portFree(port) })))));
  results.push(checkEspn(await probeEspn(cfg)));
  return results;
}

async function main(): Promise<void> {
  // --deps: only whether node_modules matches package-lock.json (the installer uses it to skip npm ci).
  const results = process.argv.includes('--deps') ? [dependencyCheck()] : await runDoctor();
  for (const r of results) {
    console.log(`${r.ok ? '[ok]' : '[!!]'} ${r.title}`);
    if (!r.ok) console.log(`     Fix: ${r.fix}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? '\nEverything looks good.' : `\n${failed} problem${failed === 1 ? '' : 's'} found.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// Real paths on both sides: through a junction or symlink argv[1] is the linked path, import.meta.url the real one.
const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  void main();
}
