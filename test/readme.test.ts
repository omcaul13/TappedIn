import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { PROJECT_ROOT } from '../src/config';

// "\t" and "\b" in a Windows path once became a tab and a backspace ("config<TAB>appedin.config.json5").
it('README.md has no control characters', () => {
  const lines = readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf8').split(/\r?\n/);
  expect(lines.flatMap((l, i) => (/[\x00-\x08\x0b-\x1f]|\t/.test(l) ? [i + 1] : []))).toEqual([]);
});
