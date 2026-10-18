import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// Bundles the app window's UI (Preact) on demand and rebuilds when a source file changes, so the UI
// can be edited while the app runs (reload the window with Ctrl+R).

const DIR = import.meta.dirname;
let cache: { mtime: number; js: string } | null = null;

function newestMtime(): number {
  return Math.max(...readdirSync(DIR).map((f) => statSync(path.join(DIR, f)).mtimeMs));
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RedZone</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(/ui/inter.woff2) format('woff2')}
html,body{margin:0;height:100%;background:transparent;overflow:hidden}</style>
</head><body><div id="app"></div><script type="module" src="/ui.js"></script></body></html>`;
}

const FONT = path.join(DIR, '..', '..', 'node_modules', '@fontsource-variable', 'inter', 'files', 'inter-latin-wght-normal.woff2');
export function uiFont(): Buffer {
  return readFileSync(FONT);
}
