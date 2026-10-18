import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DiagResult } from './diagnostics';

// "Export config" in diagnostics: a file someone can send the project owner with the fixes that made
// an adapter work. It holds the provider's override and each step's result, and nothing private:
// no cookies, no page text, and URLs cut to site + path (sign-in and player URLs carry codes and
// tokens in their query and fragment).

const PRIVATE_KEYS = new Set(['bodyText', 'text', 'html', 'cookies', 'cookie', 'body']);

/** "https://idp.edu/sso?code=abc#t=1" → "https://idp.edu/sso" anywhere in a string. */
export function stripUrls(s: string): string {
  return s.replace(/\bhttps?:\/\/[^\s"'<>)]+/g, (u) => {
    try {
      const x = new URL(u);
      return `${x.origin}${x.pathname}`;
    } catch {
      return u.split(/[?#]/)[0];
    }
  });
}

export function buildExport(o: {
  provider: { id: string; name: string; status: string };
  override: Record<string, unknown>;
  results: DiagResult[];
  appVersion: string;
  gitCommit: string | null;
}): object {
  return {
    kind: 'redzone-adapter-export',
    exportedAt: new Date().toISOString(),
    app: { version: o.appVersion, commit: o.gitCommit },
    provider: o.provider,
    override: o.override,
    results: o.results.map((r) => ({
      step: r.step,
      pass: r.pass,
      summary: stripUrls(r.summary),
      facts: Object.fromEntries(Object.entries(r.facts).filter(([k]) => !PRIVATE_KEYS.has(k)).map(([k, v]) => [k, typeof v === 'string' ? stripUrls(v) : v])),
    })),
  };
}

/** Write the export to Documents\RedZone and return its path. */
export function writeExport(data: object, documents: string, providerId: string, now = new Date()): string {
  const dir = path.join(documents, 'RedZone');
  mkdirSync(dir, { recursive: true });
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const file = path.join(dir, `redzone-${providerId}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
