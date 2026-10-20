// GET /api/latest: version, date, size and release notes of the installer /download/windows serves
// (latest.json in the R2 bucket, written by release-info.mjs when a release is published).
// ?platform=mac: the same for /download/mac (latest-mac.json, which also has minimumSystemVersion).
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('platform') === 'mac' ? 'latest-mac.json' : 'latest.json';
  const obj = await env.DOWNLOADS.get(key);
  if (!obj) return Response.json({ error: 'No release has been published yet.' }, { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
