// Builds the website: copies src/ to dist/ and fills in the sports and TV-service lists from the app's own
// config, so the site always matches what the app ships. No dependencies: `node build.mjs` (Cloudflare Pages runs it).
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Where the footer's "Report a bug" link sends mail. */
export const REPORT_EMAIL = 'REPLACE-ME@example.com';

/** The production address, for canonical links and link previews (they need absolute URLs). */
export const SITE_URL = 'https://tappedin-4ot.pages.dev';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATUS = { stable: 'Stable', experimental: 'Experimental', unsupported: 'Not working yet' };
const KIND = { campus: 'Campus TV', consumer: 'Home TV service' };

/** The shipped TV services (config/providers/*.json), stable ones first, then campus, then by name. */
export function loadServices(dir = join(here, '..', 'config', 'providers')) {
  const order = (p) => [p.status === 'stable' ? 0 : p.status === 'unsupported' ? 2 : 1, p.kind === 'campus' ? 0 : 1];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => {
      const [x, y] = [order(a), order(b)];
      return x[0] - y[0] || x[1] - y[1] || a.name.localeCompare(b.name);
    });
}

export function servicesHtml(services) {
  return services
    .map((p) => {
      const status = STATUS[p.status] ?? p.status;
      const streams = p.documentedMaxStreams ? `${p.documentedMaxStreams} documented` : 'setup measures it';
      return `<li class="svc svc-${esc(p.status)}"><div class="svc-top"><strong>${esc(p.name)}</strong><span class="badge badge-${esc(p.status)}">${esc(status)}</span></div><span class="svc-kind">${esc(KIND[p.kind] ?? p.kind)} · streams at once: ${esc(streams)}</span></li>`;
    })
    .join('\n');
}

export function sportsHtml(groups) {
  return groups
    .map(
      (g) =>
        `<li class="sport"><h3>${esc(g.family)}</h3><p class="leagues">${g.leagues.map((l) => esc(l.name)).join(' · ')}</p><p><strong>Switches for:</strong> ${esc(g.switches)}</p><p><strong>Hot moments:</strong> ${esc(g.hot)}</p></li>`,
    )
    .join('\n');
}

export function build({ out = join(here, 'dist'), providers, email = REPORT_EMAIL } = {}) {
  rmSync(out, { recursive: true, force: true });
  cpSync(join(here, 'src'), out, { recursive: true });
  const sports = JSON.parse(readFileSync(join(here, 'sports.json'), 'utf8'));
  const bug = `mailto:${email}?subject=${encodeURIComponent('TappedIn bug report')}&body=${encodeURIComponent(
    'What happened:\n\n\nWhat you expected:\n\n\nYour TV service:\n\nTappedIn version (from the installer file name, if you know it):\n\n' +
      "If it's a problem with your TV service, please attach the file from Diagnostics > Export config (it's in Documents\\TappedIn). It has no passwords or cookies.\n",
  )}`;
  const fill = {
    SERVICES: servicesHtml(loadServices(providers)),
    SPORTS: sportsHtml(sports),
    SPORT_COUNT: String(sports.length),
    LEAGUE_COUNT: String(sports.reduce((n, g) => n + g.leagues.length, 0)),
    BUG_MAILTO: esc(bug),
    REPORT_EMAIL: esc(email),
    YEAR: String(new Date().getFullYear()),
    SITE_URL,
  };
  const partial = (name) => readFileSync(join(here, 'partials', `${name}.html`), 'utf8').trimEnd();
  for (const f of readdirSync(out).filter((f) => f.endsWith('.html'))) {
    const file = join(out, f);
    // Shared nav and footer first: they carry placeholders of their own.
    const page = readFileSync(file, 'utf8').replace('{{NAV}}', partial('nav')).replace('{{FOOTER}}', partial('footer'));
    const html = page.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (!(k in fill)) throw new Error(`${f}: unknown placeholder ${m}`);
      return fill[k];
    });
    writeFileSync(file, html);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(`Built ${build()}`);
