import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config';
import { loadSetup, migrateOwner, needsSetup, saveSetup } from '../../src/setup/state';

const dir = () => mkdtempSync(path.join(tmpdir(), 'rz-setup-'));

describe('setup state', () => {
  it('a missing file means setup is not done', () => {
    const s = loadSetup(dir());
    expect(s).toMatchObject({ completed: false, provider: null, screens: 4 });
  });

  it('round-trips', () => {
    const d = dir();
    saveSetup({ ...loadSetup(d), provider: 'spectrum-tv', completed: true, screens: 2, measuredStreams: 2 }, d);
    expect(loadSetup(d)).toMatchObject({ provider: 'spectrum-tv', completed: true, screens: 2, measuredStreams: 2 });
  });

  it('a corrupt file falls back to defaults without throwing', () => {
    const d = dir();
    writeFileSync(path.join(d, 'setup.json'), '{ nope');
    expect(loadSetup(d).completed).toBe(false);
  });

  it('needsSetup until completed, and again when the provider changes', () => {
    const cfg = parseConfig({});
    const base = loadSetup(dir());
    expect(needsSetup(base, cfg)).toBe(true);
    expect(needsSetup({ ...base, completed: true, provider: 'xfinity-on-campus' }, cfg)).toBe(false);
    expect(needsSetup({ ...base, completed: true, provider: 'xfinity-on-campus' }, parseConfig({ provider: 'sling' }))).toBe(true);
  });

  it('migrateOwner marks an existing Xfinity On Campus install complete with 4 screens', () => {
    const d = dir();
    writeFileSync(path.join(d, 'xfinity-urls.json'), '{}');
    const s = migrateOwner(d, parseConfig({}));
    expect(s).toMatchObject({ provider: 'xfinity-on-campus', completed: true, screens: 4 });
    expect(loadSetup(d).completed).toBe(true);
  });

  it('migrateOwner does nothing on a fresh clone, or when setup already exists', () => {
    const fresh = dir();
    expect(migrateOwner(fresh, parseConfig({}))).toBeNull();
    expect(existsSync(path.join(fresh, 'setup.json'))).toBe(false);
    const done = dir();
    writeFileSync(path.join(done, 'xfinity-urls.json'), '{}');
    saveSetup({ ...loadSetup(done), provider: 'sling', completed: false }, done);
    expect(migrateOwner(done, parseConfig({}))).toBeNull();
    expect(loadSetup(done).provider).toBe('sling');
  });
});
