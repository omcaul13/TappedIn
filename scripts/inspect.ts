// Debug helper: describe every page open in RedZone Chrome (URL, frames, links, videos, buttons).
// Read-only; never clicks or types.
//   npm run inspect                    # all pages
//   npm run inspect -- --match guide   # only links/buttons whose text or href matches
import { loadConfig } from '../src/config';
import { connect, debugEndpoint } from '../src/windows/chrome';
import { parseFlags } from '../src/cli';

const cfg = loadConfig();
const { flags } = parseFlags(process.argv.slice(2));
const match = typeof flags.match === 'string' ? new RegExp(flags.match, 'i') : null;
const limit = Number(flags.limit ?? 80);
if (!(await debugEndpoint(cfg))) {
  console.error('RedZone Chrome is not running.');
  process.exit(1);
}
const { context } = await connect(cfg);

const DUMP = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const links = [...document.querySelectorAll('a[href]')].filter(vis).map((a) => ({ text: clean(a.innerText || a.getAttribute('aria-label') || a.title), href: a.href }));
  const buttons = [...document.querySelectorAll('button,[role=button],[role=tab],[role=link],input[type=submit],input[type=button],input[type=checkbox]')].filter(vis).map((b) => ({ text: clean(b.innerText || b.value || b.getAttribute('aria-label') || b.title || (b.type === 'checkbox' ? '[checkbox ' + (b.labels?.[0]?.innerText || b.name || '') + ']' : '')) })).filter((b) => b.text);
  const iframes = [...document.querySelectorAll('iframe')].map((f) => f.src);
  const videos = document.querySelectorAll('video').length;
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => clean(h.innerText)).slice(0, 15);
  const main = document.querySelector('main') || document.body;
  const text = ((main && main.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 700);
  return { url: location.href, title: document.title, links, buttons, iframes, videos, headings, text };
})()`;

for (const page of context.pages()) {
  if (page.url().startsWith('chrome') || page.url().startsWith('devtools')) continue;
  console.log(`\n=== PAGE ${page.url()}`);
  for (const frame of page.frames()) {
    let d: { url: string; title: string; links: { text: string; href: string }[]; buttons: { text: string }[]; iframes: string[]; videos: number; headings: string[]; text: string };
    try {
      d = await frame.evaluate(DUMP);
    } catch {
      continue;
    }
    const keep = <T extends { text: string; href?: string }>(xs: T[]) => (match ? xs.filter((x) => match.test(x.text) || match.test(x.href ?? '')) : xs).slice(0, limit);
    console.log(`--- frame ${frame === page.mainFrame() ? '(main)' : ''} ${d.url}\n    title: ${d.title}\n    videos: ${d.videos}  iframes: ${d.iframes.join(' , ') || '-'}`);
    if (d.headings.length) console.log(`    headings: ${d.headings.join(' | ')}`);
    if (flags.text && frame === page.mainFrame()) console.log(`    text: ${d.text}`);
    for (const l of keep(d.links)) console.log(`    link  "${l.text}" → ${l.href}`);
    for (const b of keep(d.buttons)) console.log(`    button "${b.text}"`);
  }
}
process.exit(0);
