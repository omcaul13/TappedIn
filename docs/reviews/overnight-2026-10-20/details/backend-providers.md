# Backend review: providers + windows/controller + shell (reviewer #3)

Base: origin/main 3dce3ca. Review worktree: C:\Users\omcau\code\redzone-wt\providers-review
Not verified against live streams (none overnight); all by code reading + unit tests with fakes.

## Fixed (PRs)

### 1. Bad `tuning`/`family` in a provider override stops the app (medium)
- Evidence: src/providers/registry.ts mergeOverride only checks `ProviderConfigSchema` (tuning = any record); the comcast/url adapters then throw on their own schema in createAdapter (src/app.ts:180), so startup fails. Contradicts "a section that doesn't validate is dropped with a warning".
- Status: FIXED, PR #11 https://github.com/omcaul13/redzone/pull/11 (overnight/fix-provider-override-tuning).

### 2. Standby load ignores a newer command and a stream limit (medium)
- Evidence: src/windows/controller.ts applyWithStandby: `stillCurrent` compares tuneGeneration, which can't change while the same screen's kick loop waits (dead "superseded" branch), so a new command waits up to startupTimeoutSeconds (25 s) and the screen first cuts to the stale game. A STREAM_LIMIT shown in the standby view is never checked (only parked views are), so standby never turns off and every leave-home switch waits 25 s. README:307 says standby turns itself off on a limit.
- Status: FIXED, PR #16 https://github.com/omcaul13/redzone/pull/16 (overnight/fix-standby-load-wait). Auto-merges with 49ebc87.

### 3. Electron spawn failure crashes / hangs startup (low)
- Evidence: src/shell.ts startShell has no `child.on('error')`; a missing/quarantined electron.exe emits only 'error' -> uncaught exception, `ready` never settles.
- Status: FIXED, PR #20 https://github.com/omcaul13/redzone/pull/20 (overnight/fix-shell-spawn-error).

### 3b. Playing video read as STALLED when checks are >4 s apart (medium, mostly after 49ebc87)
- Evidence: src/windows/health.ts HealthTracker keeps only the last 4 s of samples and needs one >=1.5 s old; with one screen's checks >4 s apart only the current sample remains, so a playing stream is STALLED after 12 s and gets re-tuned. On main rounds overlap (samples ~2 s apart); 49ebc87's no-overlap tick makes any round slower than ~2-4 s trigger it. Confirmed with a HealthTracker run (2 s: PLAYING; 4.5 s / 6 s: STALLED).
- Status: FIXED, PR #21 https://github.com/omcaul13/redzone/pull/21 (overnight/fix-health-slow-checks). Owner: worth landing together with 49ebc87.

## Not fixed (report)

### 4. Old controller keeps reporting after a configure; ERROR mode can stick (medium)
- Evidence: src/app.ts:289-296 attachController replaces `this.controller` with a new WindowController but never stops the old one. Its in-flight kick/retry on the destroyed views fails -> noteFailure -> retry -> `streamProblem` -> engine `streamError` (director.ts:479 puts the screen in ERROR = no auto-switching). The new controller has no failure record, so it never sends `streamRecovered`; the screen stays in ERROR until you act on it. Same if a screen was legitimately in ERROR before a configure (e.g. changing standby views in Settings while one screen shows "Signed out").
- Why not fixed: needs an app.ts change (outside my area; 49ebc87 edits app.ts) and a small design choice.
- Recommendation: give WindowController a `dispose()` that sets a flag checked before every `events.*` call (and in kick/retry), call it on the old controller in attachController; after resyncController, send `streamOk` for screens in ERROR (or have the new controller start with a failure record for them).

### 5. Kick loop can leave a screen on a stale channel (low-medium)
- Evidence: controller.ts:325 `for (guard < 5)`: if new commands keep arriving during 5 consecutive tunes (rapid hotkeys while tunes take 4-15 s), the loop exits with the newest want unapplied, and nothing re-kicks (checkScreen's PLAYING branch doesn't compare wants vs applied). The screen shows game N-1 while the engine thinks it shows game N, until the next command.
- Why not fixed: same file as PR #16 (one open PR per file).
- Recommendation: after the loop, if it ran out of guard without error and `keyOf(want) !== applied`, `void this.kick(screen)`.

### 6. Stream limit on a front screen doesn't turn standby off first (low-medium)
- Evidence: controller.ts noteFailure dataTile branch (:553) lowers the limit and reallocates but never calls disableStandby; README:335 "Stream limit: standby views turn off first, then the least exciting screens show live data tiles." Parked hidden streams keep counting while a visible screen drops to a data tile.
- Why not fixed: same lines as 49ebc87's stream-limit change and as PR #16's file; the limit arithmetic after unparking is a design call.
- Recommendation: call `this.disableStandby(detail)` at the top of the dataTile branch (after 49ebc87 lands), then compute the limit from streams that remain.

### 7. Configure during the startup sign-in creates a second set of views (low-medium)
- Evidence: electron/main.cjs:460-461 `await handoff(); createViews();` runs createViews unconditionally. A configure that arrives while the startup sign-in is still waiting (up to signin.waitForUserMs = 10 min; e.g. Settings -> switch service or standby views) already created views; then a second set is created with the same titles and presented on top of the ones the controller drives (marker pages cover the video).
- Why not fixed: no way to unit-test main.cjs (Electron) without new tooling.
- Recommendation: `if (!views.size) createViews();` in whenReady.

### 8. Tune that fails but leaves the old channel playing goes unnoticed (low)
- Evidence: controller.ts checkScreen: after a failed kick (applied deleted), if the page is still/again playing the previous channel (e.g. comcast `done()` throws "opened X instead of Y" with X = old channel), PLAYING clears the failure and nothing re-applies the want. Drift check can't see it because `sw.ref` is still the old channel.
- Recommendation: in the PLAYING branch, when `applied` lacks the current key and there's no failure, re-kick.

### 9. URL cache and target file writes aren't atomic (low)
- Evidence: src/windows/tuner.ts:92 and controller.ts:619 use writeFileSync in place. A crash mid-write loses all cached channel URLs (falls back to slower guide tunes). After a configure, the old controller's Tuner can also overwrite the new one's entries (same file, separate in-memory copies).
- Recommendation: write to `.tmp` + rename (as 49ebc87 does for settings.json).

### 10. Cox: remembered URLs can't be verified (low, experimental provider)
- Evidence: config/providers/cox-contour*.json `callSignInUrl: false` -> TvApp.onCallSign always true, so `done()` remembers whatever live URL it landed on and later cached-url tunes can't detect a wrong channel; drift detection is also off. PrismCast notes Cox has no cacheable watch URL.
- Recommendation: skip `tools.remember` when `callSignInUrl` is false (or set fastPath off for Cox).

### 11. compileRegex treats "/stream/live/" as a regex literal (info)
- Evidence: types.ts compileRegex: "/stream/live/" becomes /stream\/live/ (case-sensitive), "/channel/(...)/" likewise. Works today by luck of the slashes; a future pattern like "/watch/" vs "/watch" behaves differently (flags, case). No bug now; worth a comment in the provider docs.
