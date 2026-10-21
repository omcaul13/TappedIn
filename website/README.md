# TappedIn website

The download site: a home page, an install guide and a "fix your service" guide. It's plain HTML, CSS and a little JS, with no framework and no dependencies.

```text
website/
  src/                    the pages, style.css, download.js (platform detection, version line), img/, fonts/
  partials/               nav and footer shared by every page
  sports.json             the sports section (a test checks it lists exactly the app's sports)
  build.mjs               src/ -> dist/, filling in the sports and the TV services (from config/providers/*.json)
  functions/              Cloudflare Pages Functions: /download/*, /api/latest and the Mac update feed, served from R2
  lib/r2-file.js          the streaming (ranges, If-Range, 503) every /download/* Function shares
  release-info.mjs        writes latest.json for a release (release.yml runs it)
```

- **Build:** `node website/build.mjs` writes `website/dist/`.
- **Preview:** `python -m http.server -d website/dist 8080`. The download buttons and version lines need the Functions, so locally the buttons 404 and the lines show their fallback text.
- **Tests:** `npx vitest run test/website.test.ts`.
- **The bug-report address** is `REPORT_EMAIL` at the top of `build.mjs`.

## How the download works

The downloads (about 160 MB each) are too big for Cloudflare Pages (25 MiB per file) and for git, so they live in a **private R2 bucket**, `tappedin-downloads`, holding:

- `TappedIn-Setup.exe`, the latest Windows installer, and `latest.json`, `{ version, date, size, notes }`.
- `TappedIn.dmg`, the latest universal (Apple Silicon and Intel) Mac disk image; `TappedIn-mac.zip`, the same app zipped for auto-updates; and `latest-mac.json`, `{ version, date, size, notes, minimumSystemVersion }` (`size` is the dmg's, `minimumSystemVersion` a string like `"13.0"`).

The Functions serve them under the site's own address, with resumable downloads:

| Endpoint | Serves |
| --- | --- |
| `/download/windows` | `TappedIn-Setup.exe`, named `TappedIn-Setup-<version>.exe` |
| `/download/mac` | `TappedIn.dmg`, named `TappedIn-<version>.dmg` |
| `/download/mac-zip` | `TappedIn-mac.zip`, for the Mac app's updater |
| `/api/latest` | `latest.json`, for the Windows version line and release notes; `?platform=mac` returns `latest-mac.json` for the Mac line |
| `/api/update/mac/<version>` | the Squirrel.Mac feed: 204 when `<version>` is current, else `{ url, name, notes, pub_date }` pointing at `/download/mac-zip` (a prerelease like `0.1.0-beta.1` counts as older than `0.1.0`) |

A missing object gives a 503 ("try again in a few minutes") or a 404 from `/api/latest`; the page then keeps its static text and links.

On every `v*` tag, `.github/workflows/release.yml` builds the signed installer, attaches it to the GitHub release, then uploads the Windows objects to R2; the Mac release workflow uploads the Mac ones. The site never needs editing for a new version.

## One-time setup (Cloudflare)

1. **Account and bucket.** Sign up at dash.cloudflare.com (free). Go to **R2 Object Storage** and create a bucket named `tappedin-downloads`. Leave it private: no public access, no r2.dev URL.
2. **First upload (the current release).** Download the release's installer and write its `latest.json`:
   ```bash
   gh release download v0.1.0-beta.1 --repo omcaul13/TappedIn --pattern "*.exe"
   ```
   ```bash
   gh release view v0.1.0-beta.1 --repo omcaul13/TappedIn --json body --jq .body | node website/release-info.mjs v0.1.0-beta.1 TappedIn-Setup-0.1.0-beta.1.exe > latest.json
   ```
   In the bucket, **Upload** the `.exe` and rename it to `TappedIn-Setup.exe` (the dashboard takes files up to 300 MB), then upload `latest.json`.
3. **Pages project.** **Workers & Pages → Create → Pages → Connect to Git.** Pick `omcaul13/TappedIn` (allow the Cloudflare app on the private repo), then set:
   - Production branch: `main`
   - Build command: `node build.mjs`
   - Build output directory: `dist`
   - Root directory: `website`

   After the first deploy, open **Settings → Bindings → Add → R2 bucket**, set Variable name `DOWNLOADS` and Bucket `tappedin-downloads`, for both Production and Preview. Redeploy. The site is at `https://<project>.pages.dev`, and every branch gets a preview URL.
4. **Release secrets.** In R2, **Manage API tokens → Create API token** with *Object Read & Write* on `tappedin-downloads`. In GitHub (**Settings → Secrets and variables → Actions**), add `R2_ACCOUNT_ID` (shown on the R2 overview page), `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Without them a release still builds; the site keeps offering the previous installer.

## Screenshots

`src/img/*.jpg` (1600×950, JPEG q85) were taken from the app in its current look, in replay mode: data tiles, no streams. Copy `test/fixtures/replay-20261017/` to `recordings/20261017/` and run `npm start -- --replay 20261017 --speed 10` (the fixture covers 6:31–7:14 PM ET). `halftime.jpg` needs a later hour: `npm run fetch-day -- 20261017`, then `--synth --from 20:30`. Teams show the app's own abbreviation badges (no logos), the halftime reel's highlight video is pixelated, and `setup.jpg` comes from `--setup-demo`. Keep new screenshots free of broadcast video and logos, and retake them when the app's look changes.
