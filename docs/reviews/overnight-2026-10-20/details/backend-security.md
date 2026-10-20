# Backend review: security and reliability (reviewer #5, area `security`)

Base: origin/main 3dce3ca. Review worktree: C:\Users\omcau\code\redzone-wt\security-review.

## Secrets scan: CLEAN (no URGENT items)
- Every path ever committed on any branch (255 paths) checked: no `.state/`, `.env`, `logs/`, `recordings/`, browser profile, cookie or session file was ever committed.
- `git log --all -p` grepped for Google API keys (AIza...), YT_API_KEY values, GitHub/Slack/AWS/OpenAI tokens, private keys, bearer tokens, Set-Cookie, credential assignments: no hits. YT_API_KEY only ever appears as a name (read from `.env`).
- The guide HTML fixture (`test/fixtures/guide/xfinity-listings-rows.html`, both versions) has no tokens, emails, account ids or long query strings.
- `.github/workflows/release.yml`: EVS signing secrets only come from repo secrets, only on tag push (not on pull_request), so forks can't read them.

## npm audit: 0 vulnerabilities
- `npm audit --omit=dev` and `npm audit`: 0. Caveat: the castLabs Electron devDependency comes from a GitHub tarball URL, which npm audit can't check; it's v44.5.1+wvcus, keep it updated by hand.

## Credential handling: OK
- Nothing in src/, electron/ or scripts/ types into a page (no fill/type/keyboard calls). Sign-in is the user's own click; only the Xfinity On Campus Watch Now hand-off is auto-clicked, as designed.
- Cookies and tokens aren't logged. Sign-in navigation and the sign-in check log site+path only (`electron/main.cjs:156`, `:382`). The YouTube key goes only into the googleapis request and is never logged.
- Diagnostics export (`src/setup/export.ts`) drops bodyText/html/cookies keys and cuts every URL to origin+path. Facts are flat primitives (`diagnostics.ts:18`), so nothing nested slips through.
- POST routes never build file paths from the request body: override saves use the active adapter's id, service switch checks the id against `listProviders()`, and reveal is limited to Documents\TappedIn and .state (`shell.ts:74`).

## Findings

### F1 (high, FIXED) A failed log write crashes the whole app: PR #13
- `src/log.ts:58`: `appendFileSync` is unguarded. It runs inside the tick interval, controller callbacks and IPC handlers, so an EBUSY/EPERM/ENOSPC (antivirus or sync client holding the file, full disk) becomes an uncaught exception and the window closes.
- Fix: try/catch, warn once. Test `test/log.test.ts`. https://github.com/omcaul13/redzone/pull/13 (branch overnight/fix-log-write-crash)

### F2 (medium, FIXED) LiveSource keeps every timer handle it ever slept on: PR #14
- `src/espn/source.ts:90`: `sleep()` pushes each setTimeout onto `this.timers` and never removes it. The test measured 1820 handles in 2 h with nothing live; it's thousands an hour on a busy day. That's a slow leak over a 10+ h session.
- Fix: a Set that each sleep removes itself from. Test `test/live-source.test.ts`. https://github.com/omcaul13/redzone/pull/14 (branch overnight/fix-livesource-timer-leak)

### F3 (medium, NOT opened: PR #9 touches server.ts) No Host check, so DNS rebinding can read app state
- `src/server/server.ts`: GETs have no Host check. A page on a name it re-points at 127.0.0.1 is same-origin to the browser and can read `/api/state` and `/api/events`: what's on screen, settings, service, lineup and the export path (which includes the Windows user name). POSTs stay safe, because the Origin check blocks them.
- Fix ready and tested on pushed branch `overnight/fix-server-host-check` (commit a47cb46, test `test/server-host.test.ts`, full suite + typecheck pass). Not opened as a PR because #9 (overnight/fix-server-crash-bad-url) edits the same file. Open it after #9 merges; it may need a small rebase, since #9 moves the handler body into `handle()`.

### F4 (medium, not fixed: start.ts is on the avoid list) No process-level crash handlers
- There is no `uncaughtException`/`unhandledRejection` handler anywhere (only SIGINT in `scripts/start.ts:48`). Node 24 exits on either, so any throw inside `App.tick()` (setInterval, `src/app.ts:961`) or any rejected `void` promise closes the TappedIn window mid-game. Electron does quit cleanly on IPC disconnect (`main.cjs:479`), so nothing is left orphaned.
- Recommendation: in start.ts, log both events to the console and the decision log, and keep running for unhandledRejection. Or wrap `App.tick` in try/catch with a log line. Needs the owner's call (keep running vs exit).

### F5 (medium, not fixed: design) The ESPN date is fixed at startup
- `src/app.ts:266`, `:270`, `:177`: the scoreboard `date`, the live recording dir and the decision log file are all chosen once. A session left running past midnight ET keeps polling yesterday's slate, so the next day's games never show up until a restart. This is fine for late west-coast games, which ESPN buckets under the start day; it's wrong for a weekend-long session.
- Recommendation: roll the date at a fixed hour (e.g. 06:00 ET) or poll both days. It changes behavior, so it's the owner's decision.

### F6 (low, not fixed: highlights area, PR #10 open on service.ts) YouTube cache write can crash
- `src/highlights/youtube.ts` `save()`: an unguarded `writeFileSync` makes `doRefresh` reject, and `void this.highlights.refresh(...)` (`app.ts:1023`, `service.ts:58`) turns that into an unhandled rejection, which exits the app. Only with YT_API_KEY set. Same one-line fix as F1.

### F7 (low, not fixed) Other unhandled rejections
- `app.ts:847` `void this.controller.togglePanel()`: in the Chrome shell, after the user has closed the panel window, `newCDPSession` throws and the app crashes. Electron mode returns early. Fix: add `.catch(info)`.
- `app.ts:253` `void this.runReplay(...)`: replaying a date with no recording rejects. It's a stack trace instead of a message (CLI only).

### F8 (low) Disk growth with no retention
- Live recording is on by default (`start.ts`: `record: !--no-record`). The live recordings measured 6.6–52 MB per day (gzip), and nothing ever deletes them. Decision logs are about 1 MB per day, one file per day, also never deleted. Recommendation: prune recordings/*-live older than N days, or make recording opt-in for installer users.

### F9 (low) URLs that may carry query strings reach the log
- `src/windows/controller.ts:520`: the drift message logs the last URL segment, which may include `?query`. `src/shell.ts:196`: Electron stdout/stderr lines (up to 300 chars) go into the log, and Chromium errors can print full URLs. Neither goes into the diagnostics export. Recommendation: run both through `stripUrls`.

### F10 (low/info) Debug port
- `electron/main.cjs:64-65`: the CDP port (9335) is reachable by any local process, which can drive the signed-in service views. That's inherent to the playwright design. `remote-allow-origins=http://127.0.0.1` has no port, so it only matches port 80. Browser pages can't reach it, which is fine. Keep it this narrow.

### F11 (low) Smaller items
- `server.ts:32` readBody rejects past 16 KB but keeps appending chunks (only reachable after the header/Origin check).
- `app.ts:217`: the app exits with code 0 even when Electron crashed (exit code is logged only).
- `.github/workflows/release.yml`: `$tag = '${{ github.ref_name }}'` puts the tag name inline in a script. Only repo writers can push tags, so it's info only.

### Note for the owner about 49ebc87
- Its `test/server.test.ts` sends `x-redzone`, but main renamed the header to `x-tappedin`. After rebasing, that test fails (403) until the header name is updated.

## Long-session check (10+ h)
- Scratch harness (engine ticks + views every tick, forced GC every simulated hour) over `recordings/20261018-live` (15.3 h, 16 games): heap flat at about 54 MB from hour 3 to 14. Over `recordings/20261017` (52-game CFB Saturday): peak about 190 MB with games live, back to 17 MB at the end. That's bounded by the live games, not a leak.
- App-level collections are bounded: feed capped at FEED_MAX; popupKeys and lastSwitch are per screen; tickerExtra is per sport; highlights maps are per game of a fixed day; ReplyRouter entries time out; SSE streams are removed on close. The only unbounded one found was F2.
- ESPN down: each failed poll retries twice with backoff and a timeout, then logs one info line, and polling resumes by itself when ESPN is back. firstRoundDone counts failed polls, so startup doesn't hang. Not run live; engine behavior on stale data belongs to the engine reviewer.
