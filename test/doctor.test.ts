import { describe, expect, it } from 'vitest';
import {
  checkEcsElectron,
  checkEspn,
  checkNode,
  checkPorts,
  checkProviderConfig,
  checkSetupState,
  checkSignature,
  nodeMajor,
  signatureState,
} from '../scripts/doctor';

describe('doctor: Node', () => {
  it('parses the major version from process.version strings', () => {
    expect(nodeMajor('v24.11.0')).toBe(24);
    expect(nodeMajor('22.0.0')).toBe(22);
    expect(nodeMajor('banana')).toBeNull();
  });

  it('passes on 22 and later, fails before with a download link', () => {
    expect(checkNode('v22.0.0').ok).toBe(true);
    expect(checkNode('v24.11.0').ok).toBe(true);
    const old = checkNode('v20.18.1');
    expect(old.ok).toBe(false);
    expect(old.title).toContain('20.18.1');
    expect(old.fix).toMatch(/nodejs\.org/);
  });
});

describe('doctor: castLabs Electron', () => {
  it('passes only for the castLabs build (+wvcus)', () => {
    expect(checkEcsElectron('44.5.1+wvcus').ok).toBe(true);
    const stock = checkEcsElectron('44.5.1');
    expect(stock.ok).toBe(false);
    expect(stock.fix).toMatch(/npm ci/);
  });

  it('fails when Electron is not installed', () => {
    const r = checkEcsElectron(null);
    expect(r.ok).toBe(false);
    expect(r.fix).toMatch(/Setup RedZone\.cmd|npm ci/);
  });
});

describe('doctor: Widevine signature', () => {
  it('is missing without a .sig, stale when older than electron.exe, fresh otherwise', () => {
    expect(signatureState({ exeMtimeMs: 1000, sigMtimeMs: null })).toBe('missing');
    expect(signatureState({ exeMtimeMs: 2000, sigMtimeMs: 1000 })).toBe('stale');
    expect(signatureState({ exeMtimeMs: 1000, sigMtimeMs: 2000 })).toBe('ok');
    expect(signatureState({ exeMtimeMs: 1000, sigMtimeMs: 1000 })).toBe('ok');
    expect(signatureState({ exeMtimeMs: null, sigMtimeMs: null })).toBe('no-electron');
  });

  it('names npm run sign-electron as the fix', () => {
    expect(checkSignature({ exeMtimeMs: 1000, sigMtimeMs: 2000 }).ok).toBe(true);
    for (const s of [{ exeMtimeMs: 1000, sigMtimeMs: null }, { exeMtimeMs: 2000, sigMtimeMs: 1000 }]) {
      const r = checkSignature(s);
      expect(r.ok).toBe(false);
      expect(r.fix).toMatch(/sign-electron/);
    }
  });
});

describe('doctor: provider config', () => {
  it('passes for a valid config with no override warnings', () => {
    const r = checkProviderConfig('xfinity-on-campus', () => {});
    expect(r.ok).toBe(true);
    expect(r.title).toContain('xfinity-on-campus');
  });

  it('fails with the override warnings and the file to fix', () => {
    const r = checkProviderConfig('sling', (warn) => {
      warn('.state/providers/sling.json: ignoring "urls": bad');
    });
    expect(r.ok).toBe(false);
    expect(r.fix).toContain('ignoring "urls"');
    expect(r.fix).toContain('.state/providers/sling.json');
  });

  it('fails when the config cannot load', () => {
    const r = checkProviderConfig('nope', () => {
      throw new Error('unknown provider "nope"');
    });
    expect(r.ok).toBe(false);
    expect(r.fix).toContain('unknown provider');
  });
});

describe('doctor: setup state', () => {
  it('passes when absent (first start runs setup) or a JSON object', () => {
    expect(checkSetupState(null).ok).toBe(true);
    expect(checkSetupState('{"complete":true}').ok).toBe(true);
  });

  it('fails on unreadable JSON with a fix that names the file', () => {
    const r = checkSetupState('{not json');
    expect(r.ok).toBe(false);
    expect(r.fix).toContain('.state/setup.json');
    expect(checkSetupState('[1,2]').ok).toBe(false);
  });
});

describe('doctor: ports', () => {
  it('passes when every port is free, names the busy ones otherwise', () => {
    expect(checkPorts([{ port: 9335, free: true }, { port: 7480, free: true }]).ok).toBe(true);
    const r = checkPorts([{ port: 9335, free: false }, { port: 7480, free: true }]);
    expect(r.ok).toBe(false);
    expect(r.title).toContain('9335');
    expect(r.title).not.toContain('7480');
    expect(r.fix).toMatch(/already running/);
  });
});

describe('doctor: ESPN', () => {
  it('passes on HTTP 200, fails on an error or another status', () => {
    expect(checkEspn({ status: 200 }).ok).toBe(true);
    expect(checkEspn({ status: 503 }).ok).toBe(false);
    const r = checkEspn({ error: 'fetch failed' });
    expect(r.ok).toBe(false);
    expect(r.title).toContain('fetch failed');
  });
});
