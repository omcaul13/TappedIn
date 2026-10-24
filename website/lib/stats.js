// Download counts in Cloudflare D1 (binding STATS): one row per UTC day and file name, e.g.
// ("2026-10-24", "TappedIn-Setup-0.1.4-beta.2.exe", 12). No STATS binding: nothing is counted.
// Kept outside functions/ so Pages doesn't make it a route.

const CREATE = 'CREATE TABLE IF NOT EXISTS downloads (day TEXT NOT NULL, file TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, file))';
const BUMP = 'INSERT INTO downloads (day, file, n) VALUES (?1, ?2, 1) ON CONFLICT (day, file) DO UPDATE SET n = n + 1';

/** Count one download of `file`, after the response (a counting failure never breaks a download). */
export function countDownload(ctx, file, now = new Date()) {
  const db = ctx.env.STATS;
  if (!db) return;
  const done = db.batch([db.prepare(CREATE), db.prepare(BUMP).bind(now.toISOString().slice(0, 10), file)]).catch(() => {});
  if (ctx.waitUntil) ctx.waitUntil(done);
}

/** Totals per file and per day (newest first, 30 days). */
export async function readStats(db) {
  await db.prepare(CREATE).run();
  const files = (await db.prepare('SELECT file, SUM(n) AS n FROM downloads GROUP BY file ORDER BY n DESC').all()).results;
  const days = (await db.prepare('SELECT day, SUM(n) AS n FROM downloads GROUP BY day ORDER BY day DESC LIMIT 30').all()).results;
  return { files, days };
}

/** Windows installer, Mac disk image, or the Mac app's own updater (the zip). */
export const platformOf = (file) => (file.endsWith('.exe') ? 'Windows' : file.endsWith('.dmg') ? 'Mac' : file.endsWith('.zip') ? 'Mac updates' : 'Other');
