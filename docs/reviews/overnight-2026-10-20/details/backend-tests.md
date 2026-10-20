# Backend review: tests + replay/recorder/sim tooling (reviewer #6, area `tests`)

Base: origin/main 3dce3ca (the recorder fix is on 639531f). Review worktree: `C:\Users\omcau\code\redzone-wt\tests-review`.
The owner's recordings were copied into its `recordings/` and never modified. All tooling runs used copies.

## Suite stability: no problems found
- I ran the full suite 3 times plain, 3 times with `--sequence.shuffle` (random seeds), and once each under TZ=UTC, America/Los_Angeles,
  Asia/Tokyo and Pacific/Kiritimati. Every run passed all 36 files and 406 tests. No flaky or order-dependent test.
  - Note for anyone repeating this: Git Bash does not pass `TZ` to node on Windows, so set it from PowerShell.
- The engine has no wall-clock reads. The few `Date.now()` uses in tests are under fake timers or don't depend on elapsed time.
  No test touches the network or `.state/`.
- Every `it()` has an assertion. No skipped, todo or `.only` tests.
- No coverage provider is installed (not installed per the brief). Gaps below come from an esbuild import graph of the tests plus reading code.

## Findings

### 1. A torn last record crashes replay, sim and fetch-day (medium): PR #22
- `src/espn/recording.ts`. The `streamRecords` comment says a truncated last gzip member "just ends the stream".
  On Node 24 it actually throws "unexpected end of file". `readRecords` throws on the same file.
- When it happens: the recorder or the app is killed mid-append, or someone replays a `-live` folder while the app is still recording into it.
  `fetch-day` then can't even start, because it reads the finals file first.
- Fix: decompress with `Z_SYNC_FLUSH` and skip a partial last line. Test added: `test/recording.test.ts`.
- Status: https://github.com/omcaul13/redzone/pull/22 (branch overnight/fix-torn-recording)

### 2. `sim --compare` crashes on a fresh clone (low/medium): PR #23
- `scripts/sim.ts:93`. `logs/` is gitignored and only the plain run creates it. `--compare` (which CONTRIBUTING asks every contributor to run)
  runs all four variants and then dies with ENOENT. `--by-sport` does the same when `--log` points elsewhere.
- Fix: create `logs/` at startup.
- Status: https://github.com/omcaul13/redzone/pull/23 (branch overnight/fix-sim-logs-dir)

### 3. `sim --by-sport` leaves out sports picked later in the day (medium): PR #24
- `scripts/sim.ts`. The rows came from the first home picks only. Sports brought in by a game-over AUTO_PICK were counted in "all"
  but got no row of their own.
- Example: on the rebuilt 10/17 day with screens mls,epl,laliga,nhl, the rows showed 9.7 of 34.7 screen-hours and 0 of 191 fills.
- Fix: one row per sport of every home in the timeline.
- Status: https://github.com/omcaul13/redzone/pull/24 (branch overnight/fix-sim-by-sport-rows). It touches only `scripts/sim.ts`, not `src/sim.ts`
  (which 49ebc87 changes). After 49ebc87 lands, it can use the timeline's `sport`.

### 4. Replay tests read the user's config file (low): PR #25
- `test/replay.test.ts`, `test/mixed-replay.test.ts` and `test/layout.test.ts` used `loadConfig()`, which reads `config/tappedin.config.json5`.
- Taking `cfb` out of `sports.enabled` failed 10 tests.
- Fix: a `frozenConfig()` helper that uses the golden fixture config. `cfb-golden.test.ts` is unchanged.
- Status: https://github.com/omcaul13/redzone/pull/25 (branch overnight/fix-tests-frozen-config)

### 5. A restarted recorder saves every final again (low): PR #27
- `scripts/record.ts`. `finalsSaved` started empty on each run, so a restart re-fetched every final and appended duplicates.
  I reproduced it: 3 NHL finals became 6 records. `--synth` then has each of those games twice.
- Fix: start from the finals already in the file, like fetch-day does.
- Status: https://github.com/omcaul13/redzone/pull/27 (branch overnight/fix-record-restart-finals)

### 6. Tennis can't be evaluated with `npm run sim` at all (medium): not fixed
- Evidence: `sim --day 20261019 --full-lineup --screen-sports atp,wta,atp,wta` picks 0 homes and makes 0 decisions.
- Cause: tour-level matches have no listed network, so `tennisChannelStatus` (src/sports/tennis.ts:409) marks them `unconfirmed`.
  `autoHomes` (src/sim.ts:71) and the ranker (src/engine/ranker.ts:90) then skip them, and `simulation.fullLineup` doesn't override that,
  even though its doc (src/config.ts:332) says "pretend every game is watchable, each on its own channel".
  `fullLineup` only fakes a channel when the lineup has none, so all tennis shares the real Tennis Channel (838).
- Not fixed because the change belongs in the engine (owned by the engine reviewer) and changes what the sim measures.
- Recommendation: under `simulation.fullLineup`, give every game its own fake channel and skip the regional/tennis `unconfirmed` marking.
  Or add a sim flag like `--no-regional` that covers tennis too.

### 7. The sim picks homes once, so most days evaluate 1–2 screens (low, docs): not fixed
- Without `--from`, a synth day starts 5 min before the first game, and `autoHomes` only takes games that are live or starting within 45 min.
  Screens left empty stay empty all day. The app behaves the same way, so the sim is faithful to it.
- Examples: 20260913 NFL day: 1 screen, and it was an MLB game. 20261018-live: 1 screen. 20260815: 2 screens.
- The README's "add a sport" command (`--by-sport --full-lineup --screen-sports x,x,x,x`) has no `--from`, so its numbers come from 1–2 screens.
- Recommendation: add `--from <a time with a full slate>` to that README line, or have the sim also auto-pick for empty screens.
  The second option changes metrics, so it's the owner's call.

### 8. Small sim CLI issues (low): not fixed
- `scripts/sim.ts:42`: `flags.to < '06:00'` is a string comparison, so `--to 1:30` (no leading zero) is treated as 1:30 the same morning
  and the sim ends at once. `--from` after midnight gets no next-day handling at all. The same is true of `--replay --from` in scripts/start.ts
  (a file to avoid). Recommendation: parse HH:MM numerically.
- `src/engine/engine.ts:104`: `fullLineup` fake channel numbers are 900000 + the last 5 digits of the game id. Two games whose ids share their
  last 5 digits (or ids with no digits) get the same fake channel. That's rare (about 1% on a 50-game day).
- `src/espn/source.ts`: `ReplayOptions.fromMs` is declared but never used (callers skip early records themselves). Harmless.

### 9. Live recordings can be very slightly out of order (low): not fixed
- `LiveSource.scoreboardLoop` writes a record after `await ranks.attach(...)`, so sports polled in parallel can append out of `t` order.
- Found 1 record 2 ms out of order in 20261019-live. Every other file in recordings/ is ordered.
- `mergeByTime` assumes each file is ordered. A long rankings fetch could make that gap bigger.
- Recommendation: write the record before `attach` (keeping the rank fields), or let replay tolerate small inversions.
  Not fixed: live polling belongs to another reviewer (open PR #14 touches source.ts).

## Replay/recorder check by sport (sim --by-sport over copies of recordings/)
- cfb (20261017 recorded, 20261010 synth), mcbb 20260221, wcbb 20260222, nba 20260310, mlb+wnba 20260815, ucl 20260908, nfl 20260913,
  nhl 20261013, mls/epl/laliga 20261017+20261018 synth, and the -live folders 20261017/18/19: all ran, and every invariant held.
- Recording writes what replay reads. Records carry `sport`, and old records with none replay as CFB. `kind: 'error'` lines are skipped.
  Rankings are attached before recording. Tennis's trimmed scoreboard parses (there's a test for it).
  `-live` folders replay with `--day <date>-live`. Synth days built by fetch-day work for every sport with play-by-play.
- Tennis has no finals or summaries (by design). It replays, but see finding 6.
- No duplicate games in any existing finals file.

## Riskiest untested code (from the import graph: test files loading each module)
- **windows:** `controller.ts`, `screen.ts` and `timing.ts` are loaded by no test on main. 49ebc87 adds `test/controller.test.ts`; screen.ts is still untested.
- **server:** `server.ts` and `pages.ts` are loaded by no test (49ebc87 adds `test/server.test.ts`). `state.ts` has only ticker-model coverage.
- **espn:** `LiveSource` (two-tier polling, firstRoundDone, alsoPoll ticker path) has no test. Open PR #14 adds one.
  `mergeByTime`, `replayRecords` and `recordedFeed` are covered only through the CFB fixture (no `sport` field), so no test replays a recorded
  non-CFB scoreboard. A small multi-sport `-live` fixture would close that.
- **engine:** `Engine.setConfig` (hot reload), `interestingGameIds` (what gets polled) and `setProgramTitles` have no tests.
  Of the user actions, `skip`, `force`, `goHome` and `cancelAutoPick` are each used by only one test.
- **sim tooling:** `src/simMetrics.ts` is exercised only by mixed-replay's per-sport check (49ebc87 adds `test/simMetrics.test.ts`).
  `autoHomes`, `etTime`, `parseFlags` (src/cli.ts) and `src/log.ts` (formatEntry, dailyLogFile) are not tested directly.
- **config/settings:** `withOverrides`, `loadOverrides`, `saveOverrides` and `watchConfig` have no tests on main (49ebc87 adds a settings-salvage test).
- **highlights:** `service.ts` is loaded by no test. **setup:** `export.ts` writeExport is covered only through diagnostics.
- **ui:** everything except `ticker/model.ts` is untested (expected for Preact views).
- **cfb-golden:** if a golden file is missing, the test writes it and passes (`!existsSync(file)`). A renamed case would pass silently.
  Recommendation: fail when the file is missing unless UPDATE_GOLDEN=1. Not changed: the golden test must stay untouched.
