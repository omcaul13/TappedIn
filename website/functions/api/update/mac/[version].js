// GET /api/update/mac/<version>: the Squirrel.Mac update feed ("default server" format). 204 when the app's
// <version> is current; otherwise where to get the newer one (latest-mac.json in R2 says which is newest).
export async function onRequestGet({ request, env, params }) {
  const obj = await env.DOWNLOADS.get('latest-mac.json');
  const latest = obj ? await obj.json().catch(() => null) : null;
  if (typeof latest?.version !== 'string' || compareVersions(params.version, latest.version) >= 0) return new Response(null, { status: 204 });
  return Response.json(
    {
      url: `${new URL(request.url).origin}/download/mac-zip`,
      name: latest.version,
      notes: Array.isArray(latest.notes) ? latest.notes.filter((n) => typeof n === 'string').join('\n') : '',
      pub_date: /^\d{4}-\d{2}-\d{2}$/.test(latest.date ?? '') ? `${latest.date}T00:00:00Z` : undefined,
    },
    { headers: { 'cache-control': 'no-cache' } },
  );
}

/** <0, 0 or >0, comparing numeric dotted parts; a prerelease (0.1.0-beta.1) sorts below its release (0.1.0). */
export function compareVersions(a, b) {
  const split = (v) => {
    const [core, ...pre] = String(v).replace(/^v/, '').split('-');
    return { core: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: pre.join('-') };
  };
  const [x, y] = [split(a), split(b)];
  for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d) return d;
  }
  if (!x.pre || !y.pre) return (x.pre ? -1 : 0) - (y.pre ? -1 : 0);
  // Both prereleases: beta.2 < beta.10.
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}
