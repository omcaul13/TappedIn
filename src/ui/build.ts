import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// Bundles the app window's UI (Preact) on demand and rebuilds when a source file changes, so the UI
// can be edited while the app runs (reload the window with Ctrl+R).

const DIR = import.meta.dirname;
let cache: { mtime: number; js: string } | null = null;

/** Newest change anywhere under src/ui (folders like ticker/ included). */
function newestMtime(dir = DIR): number {
  return Math.max(
    0,
    ...readdirSync(dir, { withFileTypes: true }).map((f) => (f.isDirectory() ? newestMtime(path.join(dir, f.name)) : statSync(path.join(dir, f.name)).mtimeMs)),
  );
}

export async function uiBundle(): Promise<string> {
  const mtime = newestMtime();
  if (cache && cache.mtime === mtime) return cache.js;
  const out = await build({
    entryPoints: [path.join(DIR, 'main.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'chrome130',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.css': 'text' },
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  cache = { mtime, js: out.outputFiles[0].text };
  return cache.js;
}

export function uiPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TappedIn</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>@font-face{font-family:'Overpass';font-style:normal;font-weight:100 900;font-display:swap;src:url(/ui/overpass.woff2) format('woff2')}
@font-face{font-family:'Overpass Dot';src:local('Segoe UI'),local('Helvetica Neue'),local('Arial');unicode-range:U+00B7}
${TICKER_WEIGHTS.map((w) => `@font-face{font-family:'Barlow Condensed';font-style:normal;font-weight:${w};font-display:swap;src:url(/ui/barlow-condensed-${w}.woff2) format('woff2')}`).join('')}
html,body{margin:0;height:100%;background:transparent;overflow:hidden}</style>
</head><body><div id="app"></div><script type="module" src="/ui.js"></script></body></html>`;
}

// Overpass (SIL Open Font License), the body font: Highway Gothic's road-sign roots match the tickers' Barlow Condensed.
const FONT = path.join(DIR, '..', '..', 'node_modules', '@fontsource-variable', 'overpass', 'files', 'overpass-latin-wght-normal.woff2');
export function uiFont(): Buffer {
  return readFileSync(FONT);
}

/** The tickers' font, Barlow Condensed (SIL Open Font License: src/ui/fonts/OFL-barlow-condensed.txt), latin subset. */
export const TICKER_WEIGHTS = [500, 600, 700, 800] as const;
export function tickerFont(weight: number): Buffer | null {
  return (TICKER_WEIGHTS as readonly number[]).includes(weight) ? readFileSync(path.join(DIR, 'fonts', `barlow-condensed-${weight}.woff2`)) : null;
}
