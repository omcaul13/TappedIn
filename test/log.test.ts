import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DecisionLog } from '../src/log';

describe('DecisionLog', () => {
  it("doesn't throw when the log file can't be written (a crash would close the app mid-game)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tappedin-log-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // A directory where the file should be: every append fails, like a file locked by another program.
      const log = new DecisionLog({ file: dir, console: false });
      expect(() => log.write({ type: 'info', at: 0, text: 'one' })).not.toThrow();
      expect(() => log.write({ type: 'info', at: 0, text: 'two' })).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
