import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProviderConfig, previewOverride, saveOverride } from '../../src/providers/registry';
import { evaluateHide, fieldsFor, getPath, runStep, type DiagDeps } from '../../src/setup/diagnostics';
import { buildExport } from '../../src/setup/export';

const viewport = { w: 960, h: 540 };

describe('UI hiding check', () => {
  it('passes a full-size visible video on the player with the hide class', () => {
    expect(evaluateHide({ onPlayer: true, hideClass: true, video: { w: 960, h: 540, visible: true }, viewport }).pass).toBe(true);
    expect(evaluateHide({ onPlayer: true, hideClass: true, video: { w: 720, h: 540, visible: true }, viewport }).pass).toBe(true); // letterboxed 4:3
  });

  it('fails when the hide class is missing, the video is a thumbnail, or we are not on the player', () => {
    expect(evaluateHide({ onPlayer: true, hideClass: false, video: { w: 960, h: 540, visible: true }, viewport })).toMatchObject({ pass: false, why: expect.stringMatching(/hide/i) });
    expect(evaluateHide({ onPlayer: true, hideClass: true, video: { w: 320, h: 180, visible: true }, viewport })).toMatchObject({ pass: false, why: expect.stringMatching(/small/i) });
    expect(evaluateHide({ onPlayer: false, hideClass: false, video: null, viewport })).toMatchObject({ pass: false, why: expect.stringMatching(/player/i) });
    expect(evaluateHide({ onPlayer: true, hideClass: true, video: { w: 960, h: 540, visible: false }, viewport }).pass).toBe(false);
  });
});

describe('fields offered for fixing', () => {
  it('names config paths that exist for each family', () => {
    for (const id of ['xfinity-on-campus', 'spectrum-tv', 'sling', 'youtube-tv']) {
      const c = loadProviderConfig(id);
      for (const step of ['signin', 'scan', 'tune', 'playback', 'hide'] as const) {
        const fields = fieldsFor(step, c);
        expect(fields.length, `${id} ${step}`).toBeGreaterThan(0);
        for (const f of fields) expect(getPath(c, f), `${id} ${f}`).not.toBeUndefined();
      }
    }
    expect(fieldsFor('tune', loadProviderConfig('spectrum-tv'))).toContain('tuning.watchUrl');
    expect(fieldsFor('scan', loadProviderConfig('sling'))).toContain('tuning.lineup.responseUrl');
  });
});

describe('steps', () => {
  const deps = (over: Partial<DiagDeps> = {}): DiagDeps => ({
    config: loadProviderConfig('xfinity-on-campus'),
    signinCheck: async () => ({ url: 'https://www.xfinity.com/stream/', isApp: true, signedOut: false }),
    discover: async () => [{ label: 'ESPN HD', number: 849, callSign: 'ESPND', ref: null }],
    tune: async () => ({ path: 'guide', ms: 4200, url: 'https://www.xfinity.com/stream/live/x/1/ESPND?token=secret', onChannel: true }),
    watch: async () => ({ state: 'PLAYING', detail: '+2.0s' }),
    hideProbe: async () => ({ onPlayer: true, hideClass: true, video: { w: 960, h: 540, visible: true }, viewport }),
    ...over,
  });

  it('signin passes when the check page is the service and not signed out', async () => {
    expect((await runStep('signin', deps())).pass).toBe(true);
    const r = await runStep('signin', deps({ signinCheck: async () => ({ url: 'https://login.example.edu/sso', isApp: false, signedOut: false }) }));
    expect(r.pass).toBe(false);
    expect(r.summary).toMatch(/didn't reach/i);
  });

  it('scan passes when it matches a network; tune when it lands; playback when it plays', async () => {
    expect((await runStep('scan', deps())).pass).toBe(true);
    expect((await runStep('scan', deps({ discover: async () => [] }))).pass).toBe(false);
    expect((await runStep('tune', deps())).pass).toBe(true);
    expect((await runStep('tune', deps({ tune: async () => ({ path: 'url', ms: 1, url: 'x', onChannel: false }) }))).pass).toBe(false);
    expect((await runStep('playback', deps({ watch: async () => ({ state: 'STREAM_LIMIT', detail: 'maximum number of devices' }) }))).pass).toBe(false);
  });

  it('a step that throws fails with the error instead of crashing', async () => {
    const r = await runStep('scan', deps({ discover: async () => Promise.reject(new Error('guide did not load')) }));
    expect(r).toMatchObject({ pass: false, summary: expect.stringMatching(/guide did not load/) });
  });
});

describe('overrides from diagnostics', () => {
  it('a good override previews merged values', () => {
    const r = previewOverride('xfinity-on-campus', { timing: { loadGapMs: 5000 } });
    expect(r.warnings).toEqual([]);
    expect(r.config.timing.loadGapMs).toBe(5000);
    expect(r.config.timing.maxParallelTunes).toBe(2);
  });

  it('a bad override is rejected with the key names, and not saved', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rz-diag-'));
    const r = previewOverride('xfinity-on-campus', { errors: { limit: '(' } });
    expect(r.warnings.join(' ')).toMatch(/errors/);
    expect(() => saveOverride('xfinity-on-campus', { errors: { limit: '(' } }, dir)).toThrow(/errors/);
    saveOverride('xfinity-on-campus', { timing: { loadGapMs: 5000 } }, dir);
    expect(JSON.parse(readFileSync(path.join(dir, 'providers', 'xfinity-on-campus.json'), 'utf8'))).toEqual({ timing: { loadGapMs: 5000 } });
  });
});

describe('export', () => {
  it('strips query strings, fragments and page text', () => {
    const out = buildExport({
      provider: { id: 'sling', name: 'Sling TV', status: 'experimental' },
      override: { tuning: { watchUrl: 'https://watch.sling.com/1/channel/{ref}/watch' } },
      results: [{ step: 'signin', pass: false, summary: 'Signed out at https://idp.edu/sso?code=abc#t=1', facts: { url: 'https://idp.edu/sso?code=abc#t=1', bodyText: 'Hello Owen', isApp: false }, fields: [] }],
      appVersion: '0.1.0',
      gitCommit: 'abc1234',
    });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/code=abc/);
    expect(text).not.toMatch(/#t=1/);
    expect(text).not.toMatch(/Hello Owen/);
    expect(text).toMatch(/https:\/\/idp\.edu\/sso/);
    expect(text).toMatch(/\{ref\}/); // the override's templates survive
  });

  it('strips session ids carried in the path (";jsessionid=", as school sign-in pages use)', () => {
    const url = 'https://shib.example.edu/idp/profile/SAML2/Redirect/SSO;jsessionid=node0abc123?execution=e1s1';
    const out = JSON.stringify(buildExport({ provider: { id: 'x', name: 'X', status: 'experimental' }, override: {}, results: [{ step: 'signin', pass: false, summary: `ended at ${url}`, facts: { url }, fields: [] }], appVersion: '0.1.0', gitCommit: null }));
    expect(out).not.toMatch(/node0abc123/);
    expect(out).toMatch(/https:\/\/shib\.example\.edu\/idp\/profile\/SAML2\/Redirect\/SSO"/);
  });

  it('includes the provider, the override and each step result', () => {
    const out = buildExport({ provider: { id: 'sling', name: 'Sling TV', status: 'experimental' }, override: { a: 1 }, results: [{ step: 'tune', pass: true, summary: 'ok', facts: {}, fields: [] }], appVersion: '0.1.0', gitCommit: null }) as Record<string, unknown>;
    expect(out).toMatchObject({ provider: { id: 'sling' }, override: { a: 1 }, results: [{ step: 'tune', pass: true }] });
  });
});
