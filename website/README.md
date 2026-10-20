# TappedIn website

The download site: a home page, an install guide and a "fix your service" guide. It's plain HTML, CSS and a little JS, with no framework and no dependencies.

```text
website/
  src/                    the pages, style.css, download.js (platform detection, version line), img/, fonts/
  partials/               nav and footer shared by every page
  sports.json             the sports section (a test checks it lists exactly the app's sports)
  build.mjs               src/ -> dist/, filling in the sports and the TV services (from config/providers/*.json)
  functions/              Cloudflare Pages Functions: /download/windows and /api/latest, served from R2
  release-info.mjs        writes latest.json for a release (release.yml runs it)
```

- **Build:** `node website/build.mjs` writes `website/dist/`.
- **Preview:** `python -m http.server -d website/dist 8080`. The download button and version line need the Functions, so locally the button 404s and the line shows its fallback text.
- **Tests:** `npx vitest run test/website.test.ts`.
- **The bug-report address** is `REPORT_EMAIL` at the top of `build.mjs`.

## How the download works

The installer (about 160 MB) is too big for Cloudflare Pages (25 MiB per file) and for git, so it lives in a **private R2 bucket**, `tappedin-downloads`, holding two objects:

- `TappedIn-Setup.exe`, the latest installer.
- `latest.json`, `{ version, date, size, notes }`.

`/download/windows` streams the installer from the bucket under the site's own address, named `TappedIn-Setup-<version>.exe`, with resumable downloads. `/api/latest` returns `latest.json` for the version line and release notes.

On every `v*` tag, `.github/workflows/release.yml` builds the signed installer, attaches it to the GitHub release, then uploads both objects to R2. The site never needs editing for a new version.

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

`src/img/*.jpg` were taken from the app in replay mode (`npm start -- --replay 20261017 --from 19:30`): data tiles, no streams. ESPN's team logos were blocked, so teams show the app's own abbreviation badges, the halftime reel's highlight video and the logos in the game-over picker are pixelated, and `setup.jpg` comes from `--setup-demo`. Keep new screenshots free of broadcast video and logos.
