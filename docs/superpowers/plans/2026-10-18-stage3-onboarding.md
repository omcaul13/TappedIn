# Stage 3: Onboarding, Settings, Diagnostics and Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-technical student goes from a downloaded folder to four games on screen through one setup file and an in-app first-run flow. That flow covers picking a service, signing in, checking channels, testing streams and sizing the grid. The plan also adds a settings tab for the TV service and a diagnostics mode that can fix and export an adapter's config.

**Architecture:**

- **Part A (runtime):**
  - A setup state file (`.state/setup.json`) decides between setup mode and the normal app.
  - A new shell `configure` message lets the Electron window switch provider, screen count and standby views in place.
  - `src/setup/` holds the step logic (onboarding runner, diagnostics, export) behind small injected interfaces, so it is unit-tested with fakes.
- **Part B (UI):** Preact components on top of that API.
- **Part C (installer):** separate scripts with no app-code overlap, so it can run in its own session at the same time.
- **Part D (docs):** CONTRIBUTING.md and the README.

**Tech Stack:** TypeScript (ESM, tsx), Preact, zod 4, playwright-core over CDP, castLabs ECS Electron 44 (CommonJS main), vitest, PowerShell 5.1 + cmd for the installer, a Python 3.12 venv for EVS.

**Spec:** `docs/superpowers/specs/2026-10-18-stage3-onboarding.md` (parent: `2026-10-18-multi-service.md`; research: `docs/research/streaming-services.md`).

## Global Constraints

**Carried over from Stage 2**
- `src/engine/` gains only `Engine.resizeScreens(n)` (pure). `npm run sim -- --day 20261017 --compare` results stay identical to `sim-baseline.txt`, timing lines aside.
- Adapters still tune only by URL or by clicking the service's own guide. Nothing types credentials or clicks a terms or consent control. Xfinity On Campus "Watch Now" stays the only auto-click.
- Ask the owner before any live `npm start`, `provider-check`, or `npm run sign-electron`.

**Owner's setup**
- No onboarding on the owner's machine. Migration marks it complete: `xfinity-on-campus`, 4 screens, `standbyViews` 2 from `.state/settings.json`, Northeastern channels from the config file.

**Privacy and dependencies**
- Diagnostics exports contain no cookies, no page text, and no URL query strings or fragments (origin + path only).
- No new npm dependencies.
- The installer's venv pins `castlabs-evs` and `truststore`. winget installs happen only after a typed **Y** in the setup window.

**UI and platform**
- UI copy names services in text. No official logos anywhere (badges are initials on a neutral colour).
- Windows only.
- Electron args are `--name=value`. Every new config/state field has a zod schema + default.
- Branch: `stage3-onboarding` from `provider-adapters`. Commit after every task with the session's `Co-Authored-By` line.

## Review Focus

1. **Sign-in window closed mid-SSO.** Onboarding must return to "Sign in" with a Retry button, not hang. Test: Task 4 `signin failure returns to the sign-in step`.
2. **A service that plays 0 streams** (wrong network, plan without the test channel). The stream test must end with "no video played" and its reason, never a 0-screen grid. Test: Task 4 `zero playable streams reports the reason and keeps 1 screen`.
3. **A lineup scan that finds no college-football networks** (selectors broken). Show "No channels found" with a Diagnostics button. Never save an all-null lineup over a good one. Test: Task 5 `empty scan does not overwrite the saved lineup`.
4. **Exports must not leak tokens.** SSO and player URLs carry codes in query strings and fragments. Test: Task 6 `export strips query, fragment and page text`.
5. **A diagnostics override with a typo** must not break the running app. Validate before saving, and report which keys were dropped. Test: Task 6 `bad override is rejected with the key names`.

---

## File structure

```text
src/setup/state.ts            SetupState schema, load/save .state/setup.json, needsSetup(), owner migration
src/setup/runner.ts           SetupRunner: choose → sign in → scan → play test → stream test → finish (injected deps)
src/setup/diagnostics.ts      diagnostic steps (signin, scan, tune, playback, hide) + override preview/save
src/setup/export.ts           sanitized export of a provider override + results
src/setup/lineupEdit.ts       apply a mapping change from the settings page; keep raw scan rows
config/schools.json           school → provider hints for the picker search (from the research)
electron/layout.cjs           cellRects(n, w, h, top, gap): screen rectangles for 1–4 screens (shared rule)
electron/main.cjs             + configure / logout / signin-check / reveal messages; N-screen layout
src/shell.ts                  Shell.configure(), logout(), signinCheck(), reveal() (request/response over IPC)
src/app.ts                    setup mode, reconfigure(), setup + service + diagnostics API routes
src/engine/engine.ts          + resizeScreens(n)
src/ui/onboarding.tsx         first-run flow
src/ui/service.tsx            settings drawer "TV service" tab (+ mapping editor)
src/ui/diagnostics.tsx        diagnostics mode
src/ui/style.css              .grid.n1/.n2/.n3 layouts, onboarding/diagnostics styles
Setup RedZone.cmd, Update RedZone.cmd, RedZone.cmd       installer, updater, launcher (repo root)
scripts/setup.ps1, scripts/update.ps1, scripts/evs.py, scripts/doctor.ts, scripts/postinstall.ts
CONTRIBUTING.md, README.md, CLAUDE.md
```

---

## Part A: runtime

### Task 1: Setup state and owner migration

**Files:** Create `src/setup/state.ts`. Test `test/setup/state.test.ts`.

**Interfaces (produces):**
- `SetupStateSchema`:
  - `{ version: 1; provider: string | null; completed: boolean; screens: 1|2|3|4 (default 4); measuredStreams: number | null; testedAt: string | null; lineupAt: string | null }`
- `loadSetup(stateDir?): SetupState`, `saveSetup(s, stateDir?)`.
- `needsSetup(s: SetupState, cfg: Config): boolean`. True when not completed, or when `s.provider !== cfg.provider`.
- `migrateOwner(stateDir, cfg): SetupState | null`. When there's no `setup.json`, `cfg.provider === 'xfinity-on-campus'`, and `xfinity-urls.json` exists, it writes and returns `{ provider: 'xfinity-on-campus', completed: true, screens: 4 }`.

- [ ] **Step 1: Write the failing tests.**
  - `missing file → not completed`.
  - `round-trips`.
  - `needsSetup when provider differs`.
  - `migrateOwner marks an existing XOC install complete with 4 screens`.
  - `migrateOwner does nothing on a fresh clone (no URL cache)`.
  - `corrupt setup.json → defaults, never throws`.
- [ ] **Step 2:** Run `npx vitest run test/setup/state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(setup): setup state and owner migration`.

### Task 2: 1–4 screen grid

**Files:**
- Create `electron/layout.cjs`.
- Modify `electron/main.cjs` (`cellBounds` → `cellRects`), `src/ui/style.css`, `src/ui/main.tsx`, `src/engine/engine.ts`, `src/app.ts` (screen validation uses the screen count).
- Test `test/layout.test.ts`, `test/engine-screens.test.ts`.

**Interfaces (produces):**
- `cellRects(n, width, height, top, gap): {x,y,width,height}[]`. The layouts:
  - n=1: full area.
  - n=2: two columns.
  - n=3: screen 1 is the left half at full height; screens 2 and 3 are stacked on the right.
  - n=4: today's 2×2, pixel-identical to the current `cellBounds`.
- `Engine.resizeScreens(n)` replaces the director with `createDirector(n)` and keeps homes for screens ≤ n.
- The UI `<main class="grid n{N}">` uses grid-template-areas that mirror `cellRects`.

- [ ] **Step 1: Write the failing tests.**
  - `n=4 equals the old cellBounds for 1600x940` (copy the old formula into the test as the oracle).
  - `n=1,2,3 tile the area without overlap, with the gap`.
  - `engine with 2 screens only ever commands screens 1–2` (feed the 10/17 fixture as in `replay.test.ts`; check every command's `screen ≤ 2`, and that invariants hold).
  - `resizeScreens keeps homes for remaining screens`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run `npm test`, plus the sim diff. Expected: PASS, identical results.
- [ ] **Step 5:** Commit: `feat: 1-4 screen grid (shared layout rule, engine resize)`.

### Task 3: Shell configure, logout, sign-in check, reveal

**Files:** Modify `electron/main.cjs`, `src/shell.ts`. Test `test/shell-provider.test.ts` (extend).

**Interfaces (produces):**
- IPC request/response: the app sends `{ id, type, ... }`, and the shell answers `{ type: 'reply', id, ok, data?, error? }`.
- `Shell.configure({ provider: ProviderConfig; screens: number; spares: number; signin: 'now' | 'defer' }): Promise<void>`.
  - It writes the provider file and sends `configure`.
  - main.cjs closes any sign-in window, destroys every video view, reloads `SP`/`R`/partition/user agent/hide script, and recreates the views with the new counts.
  - It runs `handoff()` unless the request says `defer`, then replies once the views exist. `startShell` gains `signin: 'now' | 'defer'` (passed as `--signin=defer`).
- `Shell.logout(): Promise<void>`: `session.fromPartition(PARTITION).clearStorageData()`, then reload every view to a marker page.
- `Shell.signinCheck(): Promise<{ url: string; isApp: boolean; signedOut: boolean }>`. It loads `checkUrl` in a hidden window, without the hand-off. The URL comes back as origin + path only.
- `Shell.reveal(path: string): Promise<void>`: `shell.showItemInFolder`. The path must be inside the user's Documents\RedZone folder or `.state`; anything else is refused.
- `attachShell` waits for the *new* marker titles after a configure: views get a generation suffix, `RZ-SCREEN-<n>-g<k>`.

- [ ] **Step 1: Write the failing tests** (pure helpers exported from `src/shell.ts`):
  - `markerTitle(n, gen)`.
  - `revealAllowed(path)`: true inside Documents\RedZone and `.state`, false for `C:\Windows`.
  - `reply routing resolves the matching request id only`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS. Then `node --check electron/main.cjs`.
- [ ] **Step 5:** Run `npx tsx scripts/shell-check.ts` with the owner's OK. It runs the sign-in check only, no streams. Expected: `ready`.
- [ ] **Step 6:** Commit: `feat(shell): reconfigure in place, logout, sign-in check, reveal`.

### Task 4: Setup runner and app setup mode

**Files:** Create `src/setup/runner.ts`. Modify `src/app.ts`, `src/server/state.ts`. Test `test/setup/runner.test.ts`.

**Interfaces:**
- Consumes: `Shell.configure` (Task 3), `ProviderAdapter`, `matchLineup`, `lineupFile`, `saveSetup` (Task 1), `ScreenWindow`.
- Produces:
  - `SetupStep = 'welcome' | 'service' | 'signin' | 'channels' | 'playback' | 'streams' | 'done'`.
  - `SetupView = { step; provider: ProviderSummary | null; signin: SigninStatus | null; scan: { found: string[]; missing: string[]; rows: number } | null; playback: { channel: string; state: StreamState; detail: string } | null; streams: { measured: number; documented: number | null; message: string; perView: { channel: string; state: string }[] } | null; busy: string | null; error: string | null }`. It goes in `AppState.setup` (null outside setup).
  - `class SetupRunner { constructor(deps: SetupDeps); view(): SetupView; choose(id); retrySignin(); scan(); playTest(); streamTest(); finish(screens: number) }`.
  - `SetupDeps`: `{ configure(provider, opts), adapter(): ProviderAdapter, screens(): ScreenWindow[], channels(): Config['channels'], saveLineup(lineup, rows), saveSetup(patch), now() }`. App supplies the real ones; tests supply fakes.
- Rules:
  - **`choose`** → `configure(provider, { screens: 4, spares: 0, signin: 'now' })`.
  - **Sign-in** success advances to `channels`. Failure stays on `signin` with `error`.
  - **`scan`:**
    - Runs `discoverLineup` on screen 1.
    - Saves the lineup only if ≥ 1 network matched.
    - The result lists found/missing networks.
  - **`playTest`:**
    - Picks the first matched network of `ESPN, ESPN2, FS1, ABC, CBS, FOX, NBC, ESPNU, SEC Network, ACC Network, Big Ten Network`.
    - Tunes screen 1 and waits up to `windows.startupTimeoutSeconds` for PLAYING.
  - **`streamTest`:**
    - For k = 2..4, tunes screen k to a *different* matched network and waits for PLAYING.
    - Stops at the first `STREAM_LIMIT` or failure. `measured` = number playing (≥ 1 if `playTest` passed, else 0).
    - Then releases screens 2..4.
    - `message` explains the result in plain words. With a documented limit it says "Your plan played 2 streams at once (Comcast documents 1). RedZone will use 2 screens." If nothing played, the reason comes from the last health detail.
  - **`finish(screens)`:**
    - Clamps `screens` to 1..max(1, measured).
    - Saves the setup as completed. It doesn't touch `standbyViews`: a saved setting stays, otherwise the provider default (0) applies.
    - Calls `configure` with the screen count, then the app leaves setup mode: engine ticking and auto-homes start.
- App changes:
  - `App.start()` calls `migrateOwner`, then `needsSetup`. In setup mode it starts the server and shell (sign-in deferred until a service is chosen), and runs no `LiveSource` ticking or auto-homes.
  - New POST routes: `/api/setup/{choose,signin,scan,play,streams,finish,back}`.
  - New flag: `--setup` forces setup mode. `--setup-demo` uses a fake adapter and fake screens so the whole flow can be clicked through with no streams. The demo is for UI work and screenshots.

- [ ] **Step 1: Write the failing tests** (fakes for every dependency):
  - `choose configures the provider with sign-in now`.
  - `signin failure returns to the sign-in step`.
  - `scan saves the lineup and lists found and missing networks`.
  - `playTest picks the first carried network in priority order`.
  - `stream test stops at the first stream-limit and reports measured=2 with the documented limit in the message`.
  - `stream test tunes a different channel on each screen`.
  - `zero playable streams reports the reason and keeps 1 screen`.
  - `finish clamps screens to what played and saves completed`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement the runner + app wiring. **Step 4:** Run `npm test` and the typecheck. Expected: PASS.
- [ ] **Step 5:** Run `npm start -- --setup-demo`. Expected: the setup state advances through every step via the API. Check with `curl` POSTs carrying `x-redzone: 1`.
- [ ] **Step 6:** Commit: `feat(setup): onboarding runner and setup mode`.

### Task 5: Service settings API (switch, log out, rescan, mapping, standby)

**Files:** Create `src/setup/lineupEdit.ts`. Modify `src/app.ts`, `src/server/state.ts`. Test `test/setup/lineupEdit.test.ts`.

**Interfaces (produces):**
- Scan rows are stored in `.state/lineups/<id>.scan.json` as `DiscoveredChannel[]`.
- `applyMapping(lineup, rows, key: string, rowIndex: number | null): Config['channels']`. `null` means "not in my lineup".
- `AppState.service = { id, name, status, documentedMaxStreams, measuredStreams, screens, standbyViews, lineup: { key, channel: string | null, number: number | null }[], rows: { index, label, number }[] }`.
- POST routes:
  - `/api/service/switch {id}` re-enters setup at `signin` with the new provider.
  - `/api/service/logout` calls `Shell.logout()`, then setup at `signin`.
  - `/api/service/rescan` runs `SetupRunner.scan`; the main app stays running.
  - `/api/service/map {key,row}` saves through `applyMapping`, then `applyConfig()`.
  - `/api/service/streams` re-runs the stream test on the current screens (warns that screens blank for ~30 s).
  - `/api/service/standby {n}` saves the setting and reconfigures.

- [ ] **Step 1: Write the failing tests.**
  - `mapping a network to a scan row copies number, callSign and ref`.
  - `null mapping marks it not in my lineup`.
  - `empty scan does not overwrite the saved lineup`.
  - `games on unmapped networks are unavailable`: run `resolveChannel` on the edited lineup; BTN unmapped gives `available: false`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(setup): service settings API (switch, logout, rescan, mapping, standby)`.

### Task 6: Diagnostics and export

**Files:** Create `src/setup/diagnostics.ts`, `src/setup/export.ts`. Modify `src/app.ts`, `src/providers/registry.ts`. Test `test/setup/diagnostics.test.ts`.

**Interfaces (produces):**
- `DiagStep = 'signin' | 'scan' | 'tune' | 'playback' | 'hide'`.
- `DiagResult = { step; pass: boolean; summary: string; facts: Record<string, string | number | boolean>; fields: string[] }`. `fields` are the config paths to show for editing, e.g. `signin.checkUrl`, `signin.signedOutPattern`, `tuning.lineup.row`.
- `runStep(step, deps): Promise<DiagResult>`. Pass rules:

  | Step | Passes when |
  |---|---|
  | signin | `signinCheck().isApp && !signedOut` |
  | scan | ≥ 1 network matched |
  | tune | `onChannel` is true after `tune` |
  | playback | PLAYING within the startup timeout |
  | hide | `evaluateHide(probe)` |

- `evaluateHide(p: { onPlayer: boolean; hideClass: boolean; video: { w, h, visible } | null; viewport: { w, h } }): { pass; why }`. Passes when on the player, the hide class is set, and the visible video covers ≥ 90% of the viewport's width or height.
- `previewOverride(id, override): { config: ProviderConfig; warnings: string[] }`, in `registry.ts`. It runs the same merge as `loadProviderConfig` without reading or writing files.
- `saveOverride(id, override)` refuses when there are warnings. After a save, the app rebuilds the adapter and reconfigures the shell (screens unchanged).
- `buildExport({ provider, override, results, appVersion, gitCommit }): object`. URLs in facts are reduced to origin + path, and page text is dropped. `writeExport(obj): string` writes `Documents\RedZone\redzone-<id>-<yyyymmdd-hhmm>.json`, then `Shell.reveal`.

- [ ] **Step 1: Write the failing tests.**
  - `evaluateHide passes a full-width video on the player`; `fails when the hide class is missing`; `fails when the video is a thumbnail`.
  - `bad override is rejected with the key names`.
  - `good override previews merged values`.
  - `export strips query, fragment and page text`: facts with `https://idp.edu/sso?code=abc#t=1` become `https://idp.edu/sso`, and a `bodyText` fact is removed.
  - `export includes provider id, status, override and per-step pass`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(setup): diagnostics steps, override preview and sanitized export`.

## Part B: UI

All views reuse `style.css` tokens (`--red`, `--line`, `--dim`, Inter) and the drawer and segmented-button patterns, so they look like the existing app. Each task is checked by clicking through `npm start -- --setup-demo` and taking screenshots with the in-app browser at the `/ui` URL. The owner reviews the screenshots before the next task.

### Task 7: Onboarding screens

**Files:** Create `src/ui/onboarding.tsx`, `config/schools.json`. Modify `src/ui/main.tsx` (render `<Onboarding>` when `st.setup`), `src/ui/style.css`.

**Interfaces:**
- Consumes `AppState.setup` (Task 4) and `listProviders()` (sent as `AppState.providers`).
- `config/schools.json` holds `{ name: string; aliases: string[]; provider: string }[]`, seeded from research §2: XOC, SpectrumU and Cox schools. Stream2 and Philo schools get `provider: null` with a note.

**Screens:**

| Step | What it shows |
|---|---|
| welcome | what RedZone does; the non-affiliation and terms note; Get started |
| service | search box (service names, plus `search` keywords, plus school names); campus services first, then consumer; initials badge, name and status chip ("Experimental: untested, help us test it") |
| signin | "A sign-in window opened. Sign in with your school account / service account." Live status. Retry. "Having trouble?" opens diagnostics |
| channels | progress, then a ✓/✗ grid of the college-football networks |
| playback | a cut-out over screen 1 shows the real video playing |
| streams | screens light up as they play; the result message; a choice of grid ≤ measured (1–4 tiles) |
| done | "You're set", with Start watching |

- [ ] **Step 1:** Build it. Run `npx tsc --noEmit`. **Step 2:** Run the `--setup-demo` click-through and take a screenshot of each step. **Step 3:** Commit: `feat(ui): first-run onboarding`.

### Task 8: Settings "TV service" tab

**Files:** Create `src/ui/service.tsx`. Modify `src/ui/settings.tsx` (tabs: Switching | TV service).

- Shows the service name and status, documented vs measured streams, and the screens setting.
- Buttons: Switch service, Re-scan channels, Re-test streams, Log out, Diagnostics.
- A channel mapping table: one row per network, with a dropdown of scanned guide rows plus "Not in my lineup".
- A standby views control (0–2), with the warning "each one is an extra stream".
- Log out and Switch ask for confirmation first.

- [ ] **Step 1:** Build it. Run the typecheck. **Step 2:** Take demo screenshots. **Step 3:** Commit: `feat(ui): TV service settings`.

### Task 9: Diagnostics mode

**Files:** Create `src/ui/diagnostics.tsx`.

- A full-window panel listing the five steps. Each has Run, a pass/fail chip, a summary and facts.
- **Editing:** the step's `fields` appear as inputs prefilled from the merged config. "Save & retry" previews the change first and shows the warnings.
- **Advanced:** a JSON editor for the whole override.
- **Export:** "Export config" saves the file and opens its folder, then shows "Send this file to the project owner". The export holds no passwords and no page text.

- [ ] **Step 1:** Build it. Run the typecheck. **Step 2:** Take demo screenshots. **Step 3:** Commit: `feat(ui): diagnostics mode`.

## Part C: installer (independent: no files shared with Parts A and B)

### Task 10: EVS wrapper, doctor, postinstall check

**Files:** Create `scripts/evs.py`, `scripts/doctor.ts`, `scripts/postinstall.ts`. Modify `package.json` (`sign-electron` uses `.venv-evs\Scripts\python.exe scripts/evs.py sign-pkg node_modules/electron/dist` when the venv exists, else today's command; add `doctor`, `postinstall`). Test `test/doctor.test.ts`.

**Interfaces:**
- `evs.py` runs with `-I`. It calls `truststore.inject_into_ssl()` when truststore is installed, then hands argv to `castlabs_evs`'s CLI. That makes the Norton certificate workaround automatic. It needs verifying on the owner's machine with Norton on.
- `doctor.ts` exports pure `check*` functions, each returning `{ ok, title, fix }`. The checks:

  | Check | Passes when |
  |---|---|
  | Node | ≥ 22 |
  | castLabs Electron | installed (the `+wvcus` tag) |
  | Signature | `electron.exe.sig` exists and is newer than `electron.exe` |
  | Provider config | valid, plus any override warnings |
  | Setup state | readable |
  | Ports | 9335 and 7480 free |
  | ESPN | the scoreboard is reachable |

- `postinstall.ts` prints one line when the signature is missing or stale ("run Setup RedZone.cmd or npm run sign-electron"). It never signs anything itself.

- [ ] **Step 1: Write the failing tests** for the pure checks: Node version parse, sig staleness by mtime, ECS tag detection. **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS. Run `npm run doctor` on the owner's machine (read-only). Expected: all ok.
- [ ] **Step 5:** Commit: `feat(install): EVS wrapper with OS trust store, doctor, postinstall check`.

### Task 11: Setup RedZone.cmd

**Files:** Create `Setup RedZone.cmd` (calls `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup.ps1`), `scripts/setup.ps1`, and `RedZone.cmd` (the launcher: `npm start` in a minimized console).

`setup.ps1` steps. Each prints what it does, is idempotent, and stops with a plain-English fix on failure:
1. Check Node ≥ 22 and Python 3.12. If one is missing, explain why it's needed and ask "Install it with winget now? (Y/N)". Without a Y, print the download link and stop.
2. Run `npm ci`.
3. Create `.venv-evs` and pip-install pinned `castlabs-evs==<current>` and `truststore==<current>`.
4. EVS account: if `python scripts/evs.py account reauth` fails, run castLabs' interactive `account signup`. The user types into castLabs' own prompts; the script never reads or stores them.
5. Run `npm run sign-electron`, then confirm `electron.exe.sig` exists.
6. Run `npm run doctor`.
7. Create Start-menu and desktop shortcuts named "RedZone" pointing at `RedZone.cmd`, with the repo as the working directory.
8. Launch `RedZone.cmd`. The first start lands in onboarding.

Flag `-CheckOnly` reports each step's status without changing anything.

- [ ] **Step 1:** Write the scripts. **Step 2:** Run `powershell -File scripts\setup.ps1 -CheckOnly` on the owner's machine. Expected: every step reports "already done", with no installs and no signing.
- [ ] **Step 3:** Commit: `feat(install): one-click Setup RedZone.cmd`.

### Task 12: Update RedZone.cmd

**Files:** Create `Update RedZone.cmd`, `scripts/update.ps1`.

- With git: `git pull --ff-only`. Without it, explain how to download the new zip.
- Then `npm ci`. If the Electron version in `node_modules/electron/package.json` changed, offer to re-sign (Y/N). Then run `doctor`.
- `-CheckOnly` reports without changing anything.

- [ ] **Step 1:** Write it. **Step 2:** Run `-CheckOnly` locally. **Step 3:** Commit: `feat(install): Update RedZone.cmd`.

## Part D: docs and verification

### Task 13: CONTRIBUTING.md, README, CLAUDE.md

- **CONTRIBUTING.md:**
  - How to test a service: Setup, then pick the service, then Diagnostics if anything fails.
  - How to fix it: edit fields in diagnostics; the override file format; `provider-check`.
  - How to send the export, and what it contains and doesn't.
  - How to add a new service: copy the closest config, its family, and the rules. Only URLs and the service's own guide and buttons; no hooks.
- **README:** Setup (double-click `Setup RedZone.cmd`), onboarding, the services table with statuses, settings, diagnostics, updating, and the non-affiliation note.
- **CLAUDE.md:** `src/setup/`, setup mode, the shell messages, the installer files.

- [ ] **Step 1:** Write them. **Step 2:** Commit: `docs: setup, onboarding, diagnostics, contributing`.

### Task 14: Live verification (with the owner, on campus)

- [ ] **Step 1:** Run `npm test` and the typecheck, plus the sim diff. Expected: all pass, identical results.
- [ ] **Step 2:** With the owner's OK, run `npm start`. Expected: no onboarding (migration), 4 screens, standby 2, behavior as before.
- [ ] **Step 3:** In settings, use "Switch service" and pick Xfinity On Campus again to run the whole onboarding live. Expected:
  - sign-in via Watch Now;
  - the scan finds the Northeastern networks (BTN missing);
  - playback passes;
  - the stream test measures 4;
  - the grid is 4.
- [ ] **Step 4:** Run diagnostics on XOC. Expected: all five steps pass. Export it and check that the file holds no query strings.
- [ ] **Step 5:** On the next game day: the full-app check from Stage 2 Task 7 Step 4, then `switch-stats`.
- [ ] **Step 6:** Whole-branch review, then superpowers:finishing-a-development-branch.

---

## Decisions with recommended defaults (owner to confirm)

1. **Sign-in opens in an app-owned window** with the service's real page, not inside a screen cell. School SSO pop-ups and redirects just work there, and it's how Xfinity sign-in already works.
2. **The 3-screen layout** is one large screen on the left and two stacked on the right, rather than 2×2 with a blank cell.
3. **The owner's machine skips onboarding** through migration. You can still run it from Settings → Switch service.
4. **The installer adds `truststore` (pinned) to its private Python environment**, which fixes the Norton certificate problem automatically. It installs Node and Python only after the user types Y.
5. **Windows only.** macOS stays a separate decision.
