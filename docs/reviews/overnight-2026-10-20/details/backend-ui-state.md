# Backend review: ui-state (tickers, onboarding, settings, server, setup)

Reviewer #4. Base: origin/main 3dce3ca. Review worktree: `C:\Users\omcau\code\redzone-wt\ui-state-review`.

## 1. Any web page can crash the app with a request for `//` (high)
- Evidence: `src/server/server.ts:47-48`. The request handler is `async` and starts with
  `new URL(req.url ?? '/', 'http://localhost')`, which throws "Invalid URL" for a path of `//`.
  Nothing catches it, so it becomes an unhandled rejection and Node exits. Nothing in the app sets
  an `unhandledRejection` handler. Any site open in the user's browser can send
  `fetch('http://127.0.0.1:7480//', { mode: 'no-cors' })`. Any other throw in a GET route
  (`handlers.state()`, `uiFont()` read) takes the app down the same way.
- Status: FIXED, PR #9 https://github.com/omcaul13/redzone/pull/9 (branch `overnight/fix-server-crash-bad-url`).
  Test: `test/server-errors.test.ts`.

## 2. Window hotkeys fire while typing in the diagnostics JSON editor and selects (medium)
- Evidence: `src/ui/main.tsx:77` skips only `INPUT` targets. In the diagnostics "Edit all fixes as JSON"
  textarea (`src/ui/diagnostics.tsx:146`), t/s/m/f/0-4 run their hotkeys and `preventDefault` eats the
  character, so a key like "tuning" or a value like 1500 can't be typed. A focused `<select>` (per-sport
  level, channel mapping) has the same problem: its type-ahead (m, h) mutes or sends a screen home.
- Status: FIXED, PR #15 https://github.com/omcaul13/redzone/pull/15 (branch `overnight/fix-hotkeys-while-typing`).
  Test: `test/ui-hotkeys.test.ts`.

## 3. Diagnostics export keeps `;jsessionid=` session ids (low)
- Evidence: `src/setup/export.ts:17` keeps `origin + pathname`, and a path parameter is part of the path.
  School Shibboleth sign-in URLs (`.../SSO;jsessionid=…?execution=e1s1`) end up in the sign-in step's `url`
  fact and summary.
- Status: FIXED, PR #17 https://github.com/omcaul13/redzone/pull/17 (branch `overnight/fix-export-jsessionid`).
  Test: a new case in `test/setup/diagnostics.test.ts`.

## 4. Setup "Start watching" failure leaves the app idle (medium, not fixed)
- Evidence: `src/app.ts:335-346` `finishSetup` sets `setupRunner = null` first, then awaits
  `shell.configure` + `attachController` (a 30 s attach timeout). If either throws, `startNormal()` never
  runs: the UI drops out of setup to an empty grid with no ESPN polling or ticks. The only trace is a
  "setup finish failed" log line. `setup.json` is already saved as completed, so a restart recovers.
- Why not fixed: the right recovery (retry, back to setup with an error, start anyway) is a design call.
- Recommendation: catch in `finishSetup`. Either keep the runner and set `error`/clear `busy` so the
  Streams step can retry, or start normal mode anyway.

## 5. Sign-in "ok" during `choose()` can race the provider switch (medium, not fixed, unverified)
- Evidence: `src/setup/runner.ts:87-96` + `113-119`. `choose` sets step `signin` before awaiting
  `useProvider` (`switchProvider`: `shell.configure` with `signin: 'now'`, then `attachController`). If the
  service is still signed in from before, the shell can report `ok` before `attachController` finishes. In
  that case `onSignin` → `scan()` reads the guide through the old (or missing) controller. When `useProvider`
  returns, `choose` then sets `busy: null` while the scan is still running, so the UI allows a second
  action at the same time.
- Why not fixed: whether the ok event can arrive that early depends on the shell's timing with a real
  service, which can't be tested here (no live streams).
- Recommendation: in `onSignin`, wait for the pending `useProvider` promise before scanning, and only
  clear `busy` in `choose` if it still holds its own "Opening …" text.

## 6. GET routes have no Host check, so DNS rebinding can read app state (low, not fixed)
- Evidence: `src/server/server.ts`. The POST guard (x-tappedin + Origin) is sound. GETs like `/api/state`
  (feed, provider, diagnostics override, scan rows) don't check the `Host` header, so a rebinding page
  could read them. There are no secrets in them (no cookies or passwords).
- Recommendation: reject requests whose Host isn't `localhost:<port>` / `127.0.0.1:<port>`.

## 7. Export may still carry page text in `detail` (low, not fixed)
- Evidence: `src/setup/diagnostics.ts:107` puts the health `detail` into the playback facts. For limit,
  unavailable and login states that's the page's own error lines (`src/windows/health.ts:180-183`). The scan
  step's `sample` is the first 5 guide row labels. The spec says "no page text". These are service error
  banners and channel names, not personal data.
- Recommendation: owner decision. Keep them (useful for fixing adapters) or add `detail`/`sample` to
  `PRIVATE_KEYS`.

## 8. "Reset to the config file" is always shown and can do nothing (low, UI, not fixed)
- Evidence: `src/app.ts:1157` `overridden: Object.keys(this.overrides)` includes `screenSports` (written
  on every home pick), `provider` and `ticker`, which reset deliberately keeps (`src/app.ts:458`). After the
  first game the button (`src/ui/settings.tsx:229`) shows for good, even when there's nothing to reset.
- Recommendation: leave the kept keys out of `overridden`. This changes what the UI shows, so I left it alone.

## 9. Per-sport level "Same as Switching" can't undo a config-file level (low, not fixed)
- Evidence: `src/config.ts:493-496` `withOverrides` only adds `sportSensitivity` entries. A sport whose
  level is set in `sports.overrides` in the config file keeps it after you pick "Same as Switching" in the
  app (the select bounces back).
- Recommendation: let the override say "same as global" explicitly (for example, null). It's an edge case,
  and it's a design choice.

## 10. Smaller notes (low)
- Big ticker on + setup: `tickerTop()` (`src/app.ts:451`) still insets the views by the ticker height
  while the setup UI hides the ticker. The playback/streams "holes" can sit about 60 px off the real video.
- `PickMenu` (`src/ui/ticker/BigTicker.tsx:98`) adds its mousedown listener in a `setTimeout`. If the
  menu closes before that fires, the listener leaks.
- `saveSetup` (`src/setup/state.ts:34`) isn't atomic (settings.json got write+rename in 49ebc87, setup.json didn't).
- `state()` reads `.state/lineups/<id>.scan.json` (and the provider override while diagnostics is
  open) from disk on every broadcast (every tick).
- Provider rows in the onboarding picker are buttons with no accessible name (only nested text in spans
  with badges), so screen readers can't announce them well. That's a UI matter for the collaborator.

## Checked, no bug found
- Ticker rule: `tickerVisibility`/`miniScopeOf`/`wantsAllSports` match the README and config docs (never
  two tickers; the mini hides while the big is on; fullscreen and 1–4 screens don't change it; mini "Same"
  follows the big ticker's scope). Ticker override merge is per key. `miniScope: null` resets correctly.
- POST guard: needs `x-tappedin: 1`, and a cross-origin Origin is rejected (the custom header forces a
  preflight, which gets a 404 with no CORS headers).
- SSE: the full state is sent on connect, so EventSource's auto-reconnect resyncs. Closed streams are removed.
- Setup demo (`--setup-demo`, isolated LOCALAPPDATA, port 7494): welcome → service → sign-in → scan →
  playback → streams (3 played, limit on 4th) worked end to end. The demo writes no setup state.
- Export already drops cookies/bodyText/html keys and query/fragment.
