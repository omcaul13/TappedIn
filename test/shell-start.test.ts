import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { loadProviderConfig } from '../src/providers/registry';
import { startShell } from '../src/shell';
import { testConfig } from './helpers';

// Electron can't be started (missing or quarantined electron.exe): spawn emits 'error', not 'exit'.
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), { stdout: null, stderr: null, connected: false, exitCode: null, send() {}, kill() {} });
    setImmediate(() => child.emit('error', Object.assign(new Error('spawn electron.exe ENOENT'), { code: 'ENOENT' })));
    return child;
  },
}));

describe('startShell', () => {
  it("rejects `ready` when Electron can't be started, instead of crashing on an unhandled 'error' event", async () => {
    // What fetch throws when nothing listens on the port (on a Mac, only a refused connection counts as free).
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9335'), { code: 'ECONNREFUSED' }) });
    });
    const shell = await startShell(testConfig(), 'http://localhost:0/ui', { signin: () => {}, exit: () => {}, log: () => {} }, { provider: loadProviderConfig('xfinity-on-campus'), screens: 4, spares: 0, signin: 'defer' });
    await expect(shell.ready).rejects.toThrow(/ENOENT/);
    vi.unstubAllGlobals();
  });
});
