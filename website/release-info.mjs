// Writes the site's latest.json for a release: version, date, installer size, and the release notes cut down to
// plain one-line changes (GitHub's generated notes link PRs and usernames in a private repo).
//   gh release view v0.2.0 --json body --jq .body | node website/release-info.mjs v0.2.0 dist/TappedIn-Setup-0.2.0.exe > latest.json
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Bullet lines of a release body, without "by @user in <url>", PR links or "fix(scope):" prefixes. */
export function cleanNotes(body) {
  return body
    .split(/\r?\n/)
    .filter((l) => /^\s*[*-]\s+\S/.test(l))
    .map((l) =>
      l
        .replace(/^\s*[*-]\s+/, '')
        .replace(/\s+by @\S+(\s+in\s+\S+)?\s*$/, '')
        .replace(/\s*https?:\/\/\S+/g, '')
        .replace(/^\w+(\([^)]*\))?!?:\s*/, '')
        .trim(),
    )
    .filter(Boolean)
    .map((l) => l[0].toUpperCase() + l.slice(1));
}

export function releaseInfo(tag, exe, body, now = new Date()) {
  return { version: tag.replace(/^v/, ''), date: now.toISOString().slice(0, 10), size: statSync(exe).size, notes: cleanNotes(body) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [tag, exe] = process.argv.slice(2);
  if (!tag || !exe) throw new Error('usage: node release-info.mjs <tag> <installer.exe>  (release body on stdin)');
  console.log(JSON.stringify(releaseInfo(tag, exe, readFileSync(0, 'utf8')), null, 2));
}
