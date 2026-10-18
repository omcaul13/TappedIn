# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RedZone Director: a personal college-football "RedZone". One castLabs Electron window shows four Xfinity Stream channels in a 2×2 grid, and a director switches each screen's channel based on ESPN live data (long break → best other live game, halftime → highlights reel, final → game picker). README.md is the detailed user-facing doc (modes, switching rules, measured results); read it before changing switching behavior.

## Commands

- `npm test`: vitest (`test/**/*.test.ts`, 120 s timeout because the replay tests are slow)
- One file: `npx vitest run test/director.test.ts`. One test: `npx vitest run test/director.test.ts -t "name substring"`
- `npm run typecheck`: `tsc --noEmit` over `src`, `scripts`, `test`. There is no build step or linter. Everything runs through `tsx`, and the UI is bundled at runtime by esbuild.
- `npm start -- --dry-run`: real ESPN data, data tiles instead of video (uses no streams)
- `npm start -- --replay 20261017 --from 19:30 --speed 10`: a recorded day, sped up, on data tiles (add `--synth` for a day built by `fetch-day`)
- `npm run sim -- --day 20261017 [--from HH:MM --to HH:MM] [--compare] [--sensitivity low|medium|high] [--model classic]`: runs the real engine headless over a recorded day and prints switching metrics. Use this to evaluate any change to the detector, ranker or director.
- `npm run build-break-model`: rebuilds `config/break-model.json` from every recording

Plain `npm start` launches live Xfinity streams, and `npm run sign-electron` uploads the Electron binary to castLabs. Ask before running either one.

## Architecture

Data flow: **ESPN source → `Engine` (pure, deterministic) → commands → `WindowController` → Xfinity views**, coordinated by `src/app.ts`.

- **The engine is pure and clock-injected.** `src/engine/engine.ts` (`Engine.tick`) takes snapshots and a `now` you pass in. Live mode, replay/sim (`src/sim.ts`) and tests all run the same code, so keep wall-clock time, I/O and randomness out of `src/engine/`.
  - `gameStore` holds per-game state, accounting for the ~25 s ESPN delay and ~30 s video delay.
  - Break detection produces an `Assessment` (`LIVE`/`BREAK`/…) per game. The default is `forecastDetector` + `forecast`, which use the empirical stoppage model in `config/break-model.json`. `breakDetector` is the older "classic" weighted-signal model, kept for `--model classic` comparisons.
  - `ranker` scores substitute candidates. `director` is a pure per-screen state machine: `directorStep` for automatic switching (respects dwell and locks) and `applyAction` for user commands (bypass dwell). Every `Decision` carries a `rule` (e.g. `BREAK_FILL`, `FILL_REPLACE`, `HOME_SYNC`) and non-empty `reasons`.
  - `invariants.ts` defines rules the director must never break: no duplicate games unless flagged, dwell respected, lineup-only channels, fill-ins only during a home-game break. `test/replay.test.ts` checks them over real recorded data in `test/fixtures/replay-20261017/`. It asserts the invariants rather than exact switches, so threshold tuning shouldn't break it, but an invariant violation is a real bug.
- **Data sources are interchangeable** (`src/espn/source.ts`): `LiveSource` (two-tier polling: fast play-by-play for on-screen games and likely substitutes), recorded-day replay (`recordings/<date>/` ndjson), or a day synthesized from final play-by-play (`espn/synth.ts`, made by `fetch-day`). `espn/normalize.ts` turns raw ESPN JSON into `GameSnapshot`/`PlaySnap`.
- **Shells:** `electron` (default) is `electron/main.cjs`, a CommonJS Electron main that only does layout (4 screen views + standby views + a transparent UI view) and Xfinity "Watch Now" sign-in. `src/shell.ts` spawns it, talks over Node IPC, and attaches to its views over the debugging port with `playwright-core`, so `src/windows/` drives them the same way it drives the fallback `chrome` shell (`src/windows/chrome.ts`, `npm run start:chrome`). Electron args must be `--name=value`, never space-separated.
- **`src/windows/`:** `controller` applies only the latest wanted state per screen and handles standby views, retries, drift back to the right channel, and stream limits. `tune` changes channels (in-app guide binary search → cached URL in `.state/xfinity-urls.json` → full guide load) and loads one page at a time, because simultaneous Xfinity loads land on each other's channel. `health` polls each screen every 2 s. `inject/*.js` are page scripts injected into the Xfinity views.
- **UI:** Preact in `src/ui/`, bundled on demand by `src/ui/build.ts` (rebuilds on change, Ctrl+R in the window). `src/server/` is a localhost-only server for the UI, in-screen pages (data tile, halftime reel, picker), server-sent-event state, and a JSON API. POSTs require the `x-redzone: 1` header and a same-origin request.
- **Config:** `config/redzone.config.json5` is the one user-editable file. Every key has a default and a zod schema in `src/config.ts` (`parseConfig`), and most sections hot-reload via `Engine.setConfig`. Settings changed in the app go to `.state/settings.json` and override the config file. When you add a knob, add it to the schema/defaults in `src/config.ts` and document it in the json5 file. `test/helpers.ts` `testConfig()` builds a config with a small fixed lineup. Use it and the `snap`/`play`/`view` builders in tests.
- **Channels:** `channels.ts` maps ESPN network names (`aliases`) to the guide channel `number` and Xfinity `callSign`. `number: null` means the network isn't in the lineup.

## Conventions and constraints

- ESM TypeScript (`"type": "module"`, bundler resolution, extensionless imports). `electron/*.cjs` stays CommonJS.
- Logs: switch decisions and timings go to `logs/decisions-*.jsonl`, which `analyze-log`/`switch-stats` read. `recordings/`, `logs/`, `.state/`, `.chrome-profile/` and `spike-report/` are gitignored local data.
- The app must never extract or redistribute streams, touch DRM, type credentials, or click Xfinity's Terms of Activation. Sign-in is only the user's own "Watch Now" click. Keep it that way.
