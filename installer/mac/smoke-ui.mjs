// Smoke check of what the running Mac app's window shows (release-mac.yml): attaches to its debugging port with
// the app's own playwright-core, lists its pages, screenshots the UI page and fails if it has no top bar.
//   node installer/mac/smoke-ui.mjs <TappedIn.app> <out-dir> <label>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [app, out, label] = process.argv.slice(2);
const require = createRequire(path.join(app, 'Contents/Resources/app/package.json'));
const { chromium } = require('playwright-core');
mkdirSync(out, { recursive: true });

const targets = await fetch('http://127.0.0.1:9335/json/list').then((r) => r.json());
const report = { targets: targets.map((t) => ({ type: t.type, title: t.title, url: t.url.slice(0, 120) })) };
const browser = await chromium.connectOverCDP('http://127.0.0.1:9335');
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('/ui'));
if (page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.reload();
  await page.waitForTimeout(5000);
  report.ui = await page.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.slice(0, 400),
    topbar: !!document.querySelector('.topbar, .bt'),
    htmlClass: document.documentElement.className,
    size: [innerWidth, innerHeight, devicePixelRatio],
  }));
  report.errors = errors;
  await page.screenshot({ path: path.join(out, `ui-${label}.png`) });
}
writeFileSync(path.join(out, `ui-${label}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Exit without browser.close(): only the connection should end, never the app's window.
if (!report.ui?.topbar) console.error(`The window's UI did not render (${page ? 'no top bar' : 'no UI page'}).`);
process.exit(report.ui?.topbar ? 0 : 1);
