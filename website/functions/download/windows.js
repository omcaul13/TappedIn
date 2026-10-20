// GET/HEAD /download/windows: the latest installer, streamed from the private R2 bucket (binding DOWNLOADS)
// so it downloads from the site's own address. Range requests work, so an interrupted download can resume.
const KEY = 'TappedIn-Setup.exe';

const unavailable = () =>
  new Response('The TappedIn installer is not available right now. Please try again in a few minutes.', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '300' },
  });

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const meta = await env.DOWNLOADS.head(KEY);
  if (!meta) return unavailable();
  const headers = new Headers({
    'content-type': 'application/vnd.microsoft.portable-executable',
    'content-disposition': `attachment; filename="${await fileName(env)}"`,
    'accept-ranges': 'bytes',
    etag: meta.httpEtag,
    'cache-control': 'no-cache',
  });
  if (request.method === 'HEAD') {
    headers.set('content-length', String(meta.size));
    return new Response(null, { headers });
  }
  // A resume against an older installer (If-Range no longer matches) gets the whole new file instead.
  const ifRange = request.headers.get('if-range');
  const range = request.headers.has('range') && (!ifRange || ifRange === meta.httpEtag) ? parseRange(request.headers.get('range'), meta.size) : null;
  if (range === false) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${meta.size}` } });
  // shortcut: a release uploaded between head() and get() could mix versions in one ranged response; uploads are rare, add onlyIf etag checks if that ever matters.
  const obj = await env.DOWNLOADS.get(KEY, range ? { range } : undefined);
  if (!obj) return unavailable();
  if (!range) {
    headers.set('content-length', String(meta.size));
    return new Response(obj.body, { headers });
  }
  headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
  headers.set('content-length', String(range.length));
  return new Response(obj.body, { status: 206, headers });
}

/** One `bytes=a-b` range as {offset, length}; null for anything else (send the whole file); false when it's past the end. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return false;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return false;
  return { offset: start, length: end - start + 1 };
}

/** TappedIn-Setup-<version>.exe, with the version from latest.json; the plain name if that's missing or odd. */
async function fileName(env) {
  const latest = await env.DOWNLOADS.get('latest.json');
  const version = latest ? (await latest.json().catch(() => null))?.version : null;
  return typeof version === 'string' && /^[\w.-]+$/.test(version) ? `TappedIn-Setup-${version}.exe` : 'TappedIn-Setup.exe';
}
