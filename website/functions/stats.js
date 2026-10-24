// GET /stats: download counts for the two of us, behind the browser's password prompt (any user name, the
// password is the STATS_PASSWORD secret). Not set up (no STATS database or no password): 404, like any page.
import { platformOf, readStats } from '../lib/stats.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NO_INDEX = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

/** The password from a Basic Authorization header, or null. */
function passwordOf(request) {
  const m = /^Basic\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!m) return null;
  try {
    const decoded = atob(m[1]);
    return decoded.slice(decoded.indexOf(':') + 1);
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.STATS || !env.STATS_PASSWORD) return new Response('Not found', { status: 404, headers: NO_INDEX });
  if (passwordOf(request) !== env.STATS_PASSWORD) {
    return new Response('Password needed', { status: 401, headers: { ...NO_INDEX, 'www-authenticate': 'Basic realm="TappedIn stats", charset="UTF-8"' } });
  }
  const { files, days } = await readStats(env.STATS);
  const byPlatform = new Map();
  for (const f of files) byPlatform.set(platformOf(f.file), (byPlatform.get(platformOf(f.file)) ?? 0) + f.n);
  const total = files.filter((f) => platformOf(f.file) !== 'Mac updates').reduce((a, f) => a + f.n, 0);
  const rows = (list, key) => list.map((r) => `<tr><td>${esc(r[key])}</td><td>${r.n}</td></tr>`).join('') || '<tr><td colspan="2">None yet</td></tr>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>TappedIn downloads</title>
<style>body{margin:0;padding:24px 16px;background:#0b1a12;color:#f4efe2;font:15px/1.4 system-ui,sans-serif}main{max-width:640px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}p{color:#a8b8a2;margin:0 0 20px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a8b8a2;margin:24px 0 6px}
.big{display:flex;gap:12px;flex-wrap:wrap}.big div{background:#122a1c;border:1px solid #335640;border-radius:10px;padding:10px 14px;min-width:120px}.big b{display:block;font-size:26px}
table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #22402e}td:last-child{text-align:right;font-variant-numeric:tabular-nums}</style></head>
<body><main><h1>TappedIn downloads</h1><p>From the website's download buttons, counted since the stats were switched on. Days are UTC.</p>
<div class="big"><div><b>${total}</b>downloads</div>${[...byPlatform].map(([p, n]) => `<div><b>${n}</b>${esc(p)}</div>`).join('')}</div>
<h2>By file</h2><table>${rows(files, 'file')}</table><h2>By day</h2><table>${rows(days, 'day')}</table></main></body></html>`;
  return new Response(html, { headers: { ...NO_INDEX, 'content-type': 'text/html; charset=utf-8' } });
}
