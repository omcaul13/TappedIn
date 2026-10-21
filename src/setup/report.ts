import type { DiagResult } from './diagnostics';

// "Report a bug" in diagnostics: an email to the project owner (the website's address) with the
// service, each step's result and the user's fixes, and nothing private: no cookies, no page text,
// and URLs cut to site + path (sign-in and player URLs carry codes and tokens in their query and fragment).

export const REPORT_EMAIL = 'tappedinsupport@gmail.com';
/** mailto: links much longer than this get cut off or refused by Windows mail apps. */
const MAX_BODY = 1800;

/** "https://idp.edu/sso?code=abc#t=1" → "https://idp.edu/sso" anywhere in a string. */
export function stripUrls(s: string): string {
  return s.replace(/\bhttps?:\/\/[^\s"'<>)]+/g, (u) => {
    try {
      const x = new URL(u);
      // Path parameters too: ";jsessionid=…" is a session id (school sign-in pages carry one).
      return `${x.origin}${x.pathname.replace(/;[^/]*/g, '')}`;
    } catch {
      return u.split(/[?#;]/)[0];
    }
  });
}

export function bugMailto(o: { providerId: string; providerName: string; appVersion: string; results: DiagResult[]; override: Record<string, unknown> }): string {
  const steps = o.results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.step}: ${stripUrls(r.summary)}`).join('\n');
  const fixes = Object.keys(o.override).length ? JSON.stringify(o.override) : 'none';
  const body = `What happened:\n\n\nYour TV service: ${o.providerName} (${o.providerId})\nTappedIn version: ${o.appVersion}\n\nDiagnostics:\n${steps || 'not run'}\n\nMy fixes: ${fixes}\n`;
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`TappedIn bug report: ${o.providerName}`)}&body=${encodeURIComponent(body.slice(0, MAX_BODY))}`;
}
