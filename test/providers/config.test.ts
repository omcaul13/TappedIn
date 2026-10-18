import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from '../../src/config';
import { compileRegex, createAdapter, listProviders, loadProviderConfig } from '../../src/providers/registry';

const PROVIDERS_DIR = path.join(PROJECT_ROOT, 'config', 'providers');

function stateDirWith(id: string, override: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rz-providers-'));
  mkdirSync(path.join(dir, 'providers'), { recursive: true });
  writeFileSync(path.join(dir, 'providers', `${id}.json`), JSON.stringify(override));
  return dir;
}

describe('provider config', () => {
  it("xfinity-on-campus config parses with today's values", () => {
    const c = loadProviderConfig('xfinity-on-campus', { stateDir: mkdtempSync(path.join(tmpdir(), 'rz-empty-')) });
    expect(c).toMatchObject({ id: 'xfinity-on-campus', shortName: 'Xfinity', family: 'comcast', status: 'stable' });
    expect(c.shell.partition).toBe('persist:xfinity');
    expect(c.signin.portalUrl).toBe('https://www.xfinityoncampus.com/');
    expect(c.signin.autoClick?.text).toBe('watch now');
    expect(c.timing.loadGapMs).toBe(3500);
    expect(c.timing.maxParallelTunes).toBe(2);
    expect(c.defaults.standbyViews).toBe(0);
  });

  it('every shipped provider config parses and every regex compiles', () => {
    const ids = readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    expect(ids.length).toBeGreaterThan(0);
    const empty = mkdtempSync(path.join(tmpdir(), 'rz-empty-'));
    for (const id of ids) {
      const warnings: string[] = [];
      const c = loadProviderConfig(id, { stateDir: empty, onWarning: (m) => warnings.push(m) });
      expect(c.id).toBe(id);
      expect(warnings).toEqual([]);
      for (const src of [c.shell.appUrl, c.shell.playerUrl, c.signin.signedOutPattern, c.errors.loginUrl, c.errors.limit, c.errors.unavailable, c.errors.loginText, c.errors.idlePrompt, ...c.errors.probePatterns]) {
        expect(() => compileRegex(src)).not.toThrow();
      }
    }
  });

  it('override deep-merges over the shipped config', () => {
    const c = loadProviderConfig('xfinity-on-campus', { stateDir: stateDirWith('xfinity-on-campus', { timing: { loadGapMs: 4000 } }) });
    expect(c.timing.loadGapMs).toBe(4000);
    expect(c.timing.maxParallelTunes).toBe(2);
  });

  it('bad override falls back to shipped values', () => {
    const warnings: string[] = [];
    const c = loadProviderConfig('xfinity-on-campus', {
      stateDir: stateDirWith('xfinity-on-campus', { errors: { limit: '(' }, timing: { loadGapMs: 'x' } }),
      onWarning: (m) => warnings.push(m),
    });
    expect(c.timing.loadGapMs).toBe(3500);
    expect(() => compileRegex(c.errors.limit)).not.toThrow();
    const all = warnings.join('\n');
    expect(all).toMatch(/errors/);
    expect(all).toMatch(/timing/);
  });

  it('unreadable override JSON is reported and ignored', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rz-providers-'));
    mkdirSync(path.join(dir, 'providers'), { recursive: true });
    writeFileSync(path.join(dir, 'providers', 'xfinity-on-campus.json'), '{ not json');
    const warnings: string[] = [];
    const c = loadProviderConfig('xfinity-on-campus', { stateDir: dir, onWarning: (m) => warnings.push(m) });
    expect(c.timing.loadGapMs).toBe(3500);
    expect(warnings.length).toBe(1);
  });

  it('listProviders lists xfinity-on-campus as stable', () => {
    const xoc = listProviders().find((p) => p.id === 'xfinity-on-campus');
    expect(xoc).toMatchObject({ name: 'Xfinity On Campus', status: 'stable', kind: 'campus' });
    expect(xoc?.badge.initials.length).toBeLessThanOrEqual(3);
  });

  it('only Xfinity On Campus ever auto-clicks a sign-in button', () => {
    for (const p of listProviders()) {
      const c = loadProviderConfig(p.id, { stateDir: mkdtempSync(path.join(tmpdir(), 'rz-empty-')) });
      if (p.id === 'xfinity-on-campus') expect(c.signin.autoClick).not.toBeNull();
      else expect(c.signin.autoClick).toBeNull();
    }
  });

  it('every shipped provider builds an adapter, except ones marked unsupported', () => {
    for (const p of listProviders()) {
      if (p.status === 'unsupported') continue;
      expect(createAdapter(p.id, { stateDir: mkdtempSync(path.join(tmpdir(), 'rz-empty-')) }).config.id).toBe(p.id);
    }
  });

  it('experimental providers default to no standby views and get their own sign-in partition', () => {
    const partitions = new Set<string>();
    for (const p of listProviders()) {
      const c = loadProviderConfig(p.id, { stateDir: mkdtempSync(path.join(tmpdir(), 'rz-empty-')) });
      expect(c.defaults.standbyViews).toBe(0);
      expect(partitions.has(c.shell.partition)).toBe(false);
      partitions.add(c.shell.partition);
    }
  });

  it('xfinity-stream is the consumer Xfinity app with its own sign-in', () => {
    const c = loadProviderConfig('xfinity-stream', { stateDir: mkdtempSync(path.join(tmpdir(), 'rz-empty-')) });
    expect(c).toMatchObject({ family: 'comcast', kind: 'consumer', status: 'experimental', shortName: 'Xfinity', documentedMaxStreams: 5 });
    expect(c.signin.portalUrl).toBeNull();
    expect(c.tuning).toEqual(loadProviderConfig('xfinity-on-campus').tuning);
  });

  it('unknown provider id throws a readable error', () => {
    expect(() => loadProviderConfig('nope')).toThrow(/unknown provider "nope"/);
  });
});
