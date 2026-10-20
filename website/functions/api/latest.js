// GET /api/latest: version, date, size and release notes of the installer /download/windows serves
// (latest.json in the R2 bucket, written by release-info.mjs when a release is published).
export async function onRequestGet({ env }) {
  const obj = await env.DOWNLOADS.get('latest.json');
  if (!obj) return Response.json({ error: 'No release has been published yet.' }, { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
