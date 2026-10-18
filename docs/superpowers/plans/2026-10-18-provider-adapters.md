# Provider Adapters (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Xfinity-specific window layer into provider adapters driven by per-adapter JSON config. Keep Xfinity On Campus behaving exactly as today, then add experimental adapters for Xfinity Stream, Spectrum, Cox Contour, YouTube TV and Sling.

**Architecture:**
- **Engine unchanged.** The engine (`src/engine/`) still sees a channel as a positive integer `number`. It is untouched, so `npm run sim` results must stay identical (timing lines aside).
- **Adapters under `src/providers/`.** Below the engine, a `ProviderAdapter` owns everything site-specific: tuning, release, warm-up, drift check, idle prompt and lineup discovery.
- **Config per provider.** Each provider's fragile details (URLs, selectors, timings, error text, sign-in rules, hide CSS) come from `config/providers/<id>.json`. A user's fixes go in `.state/providers/<id>.json`, deep-merged on top.
- **Electron main gets data, not code.** `electron/main.cjs` stops hard-coding Xfinity. It reads a resolved "shell provider" JSON that `src/shell.ts` writes before spawning it.

**Tech Stack:** TypeScript (ESM, tsx), zod 4, playwright-core over CDP, castLabs ECS Electron 44 (CommonJS main), vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-multi-service.md` (plus the research report `docs/research/streaming-services.md`).

## Global Constraints

**Engine and Xfinity regression bar**
- `src/engine/**` must not change. `npm run sim -- --day 20261017 --compare` must produce identical output before and after, ignoring the `  ran … in Ns` timing lines (compare with `grep -v "^  ran "`).
- Xfinity On Campus regression bar: same tune paths (`in-app`, `cached-url`, `guide`, `standby swap`, `standby <path>`) and the same constants:
  - load gap 3500 ms; 2 concurrent tunes; in-app guide timeout 8000 ms; guide wait 20000 ms; page-load timeout 30000 ms
  - Close Player timeout 5000 ms; spare guide warm-up delay 20000 ms; hide-script poll 500 ms; sign-in check settle 4000 ms; post-Watch-Now settle 5000 ms
  - Watch Now click: 30 tries × 500 ms; stream wait 40 s after a click or 600 s without one
  - partition `persist:xfinity`; cache file `.state/xfinity-urls.json`; same user-visible strings (shortName "Xfinity")

**Allowed and forbidden page access**
- Tune only by navigating to a URL or clicking the service's own guide.
- No calling private page functions, no rewriting network requests, no hooking app state.
- Reading DOM, URLs and the page's own responses is allowed.
- Never type credentials. Never click a terms, consent or activation control. The XOC "Watch Now" auto-click is the only auto-click, and it stays XOC-only.

**Branding and standby defaults**
- No official logos anywhere: providers get `badge: { initials, color }`.
- Standby views default to **0** for every provider. The owner keeps 2 via `.state/settings.json`.

**Process rules**
- New config knobs get a zod schema + default.
- Electron args are `--name=value`.
- Ask the owner before `npm start` (live) or `npm run sign-electron`.
- Work on branch `provider-adapters`. Commit after every task. Commit messages end with the `Co-Authored-By` line the session gives.

## Review Focus

1. **A user override file with a typo, or an invalid regex.** The app must start with the shipped config and report the bad keys. Test: Task 1 `bad override falls back to shipped values`.
2. **A university SSO sign-in that hops through pop-up windows.** Sign-in is "done" when *any* window of the partition reaches the signed-in state. Test: Task 6 `signinDone checks every window`.
3. **Switching providers.** Must never reuse another provider's cached URLs or lineup. Test: Task 3 `cache file is per provider; XOC keeps legacy name`.
4. **Guide names that differ from ESPN's network names** ("ESPN2 HD", "FOX Sports 1", "Big Ten Network HD"). They must still match. Test: Task 5 `matches decorated guide names`.
5. **A stale `standbyViews: 2` in someone's config on a 1-stream plan.** Standby resolution must prefer the `.state` override, then the config, then the provider default (0). Test: Task 6 `effective standby resolution`.

---

## File structure

```text
config/providers/<id>.json            shipped per-adapter config (one per provider id)
src/providers/types.ts                ProviderConfig schema (zod), ProviderAdapter interface, ChannelRef, TuneTools
src/providers/registry.ts             list/get adapters; load config + .state override (deep merge, validated)
src/providers/networks.ts             canonical college-football networks + guide-name aliases; matchLineup()
src/providers/lineup.ts               effective lineup: .state/lineups/<id>.json over config channels
src/providers/comcast/tvapp.ts        Comcast "TV-APP" driver (moved from src/windows/tune.ts), config-driven
src/providers/comcast/adapter.ts      ProviderAdapter for xfinity-on-campus, xfinity-stream, cox-contour
src/providers/spectrum/adapter.ts     URL tuning via ?tmsid=
src/providers/youtube-tv/adapter.ts   URL tuning via /watch/<id> (only if the sign-in spike passes)
src/providers/sling/adapter.ts        URL tuning via /1/channel/<guid>/watch
src/windows/tuner.ts                  generic Tuner: 2 slots, one page load at a time + gap, per-provider URL cache
src/windows/tune.ts                   deleted (contents move to comcast/tvapp.ts and windows/tuner.ts)
electron/signin-rules.cjs             pure sign-in predicates (CommonJS; unit-tested)
electron/main.cjs                     reads --provider=<file>; no Xfinity literals left
scripts/provider-check.ts             npm run provider-check -- <id> [--signin] [--scan] [--tune ESPN,FS1]
```

---

### Task 0: Baseline

**Files:** none committed except the plan, spec and research doc.

- [ ] **Step 1:** Create the branch: `git switch -c provider-adapters`.
- [ ] **Step 2:** Capture the baseline. Run `npm run sim -- --day 20261017 --compare > "$SCRATCH/sim-baseline.txt"`, plus `npm test` and `npm run typecheck`. Expected: all pass. Keep the file for Task 7.
- [ ] **Step 3:** Commit the docs: `git add docs && git commit -m "docs: multi-service research, spec and Stage 2 plan"`.

### Task 1: Provider config schema and registry

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/registry.ts`
- Create: `config/providers/xfinity-on-campus.json`
- Test: `test/providers/config.test.ts`

**Interfaces:**
- Produces:
  - `ProviderConfigSchema` (zod) and `type ProviderConfig`.
  - `type ProviderStatus = 'stable' | 'experimental' | 'unsupported'`.
  - `listProviders(): ProviderSummary[]`, where `ProviderSummary = { id, name, shortName, kind: 'campus' | 'consumer', status, badge, search: string[], documentedMaxStreams: number | null }`.
  - `loadProviderConfig(id: string, opts?: { stateDir?: string; onWarning?: (msg: string) => void }): ProviderConfig`.
  - `compileRegex(src: string, flags?: string): RegExp`.

`ProviderConfigSchema` fields (all with defaults unless marked required):

| Section | Fields |
|---|---|
| top level | `id`*, `name`*, `shortName`*, `family: 'comcast' \| 'spectrum' \| 'youtube-tv' \| 'sling'`*, `kind`*, `status`*, `badge: { initials (≤3 chars), color }`*, `search: string[]`, `documentedMaxStreams: number \| null`, `defaults: { standbyViews: number }` (default 0), `notes: string` |
| `shell` | `partition`*, `userAgent: 'chrome' \| 'default'`, `appUrl` (regex source)*, `playerUrl` (regex source)*, `hideCss: string` |
| `signin` | `checkUrl`*, `signedOutPattern` (regex source)*, `portalUrl: string \| null`, `autoClick: { selector, text } \| null`, `instructions`*, `windowTitle`*, `checkSettleMs` (4000), `handoffSettleMs` (5000), `autoClickTries` (30), `autoClickIntervalMs` (500), `waitAfterClickMs` (40000), `waitForUserMs` (600000) |
| `errors` | `probePatterns: string[]`, `loginUrl`, `limit`, `unavailable`, `loginText`, `idlePrompt` (regex sources). Defaults are copied verbatim from today's `probe.js` `ERROR_PATTERNS` and the `health.ts` constants. |
| `timing` | `loadGapMs` (3500), `maxParallelTunes` (2), `spareWarmDelayMs` (20000), `hidePollMs` (500) |
| `tuning` | `Record<string, unknown>`; each adapter parses its own section |

- [ ] **Step 1: Write the failing tests.**
  - `xfinity-on-campus config parses with today's values`:
    - `id === 'xfinity-on-campus'`, `shortName === 'Xfinity'`, `family === 'comcast'`, `status === 'stable'`, `shell.partition === 'persist:xfinity'`
    - `signin.portalUrl === 'https://www.xfinityoncampus.com/'`, `signin.autoClick.text === 'watch now'`
    - `timing.loadGapMs === 3500`, `defaults.standbyViews === 0`
  - `every shipped provider config parses and every regex compiles`: loop over `config/providers/*.json`.
  - `override deep-merges`: write `{ timing: { loadGapMs: 4000 } }` to a temp `stateDir/providers/xfinity-on-campus.json`. Expect `loadGapMs === 4000` and `maxParallelTunes === 2`.
  - `bad override falls back to shipped values`: an override with `errors.limit: "("` and `timing.loadGapMs: "x"`. Expect the shipped values back and `onWarning` called with a message naming both keys.
  - `listProviders lists xfinity-on-campus as stable`.
- [ ] **Step 2:** Run `npx vitest run test/providers/config.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts`, `registry.ts` and the XOC JSON. Values are copied from `electron/main.cjs`, `src/windows/tune.ts`, `health.ts` and `probe.js` exactly.
  - Bad-override handling: validate each top-level section separately. Keep valid sections and drop invalid ones with a warning.
- [ ] **Step 4:** Run the test. Expected: PASS. `npm run typecheck` passes.
- [ ] **Step 5:** Commit: `feat(providers): provider config schema, registry, XOC config`.

### Task 2: Config-driven health classification

**Files:**
- Modify: `src/windows/inject/probe.js`, which becomes `(patterns) => {...}` instead of an IIFE
- Modify: `src/windows/health.ts`
- Modify: `src/windows/policy.ts`
- Test: `test/health.test.ts` (new), `test/policy.test.ts` (update)

**Interfaces:**
- Consumes: `ProviderConfig['errors']`.
- Produces:
  - `type ErrorRules = { probePatterns: string[]; loginUrl: RegExp; limit: RegExp; unavailable: RegExp; loginText: RegExp; idlePrompt: RegExp }`
  - `errorRules(cfg: ProviderConfig): ErrorRules`
  - `probePage(page: Page, patterns: string[]): Promise<FrameProbe[]>`
  - `new HealthTracker(timeouts, rules?: ErrorRules)`. When `rules` is omitted it uses `DEFAULT_RULES`, which equal today's constants.
  - `adviseOnStream(state, attempts, retrySeconds, shortName = 'Xfinity')`

- [ ] **Step 1: Write the failing tests.** Use `HealthTracker.update(frames, now)` with synthetic `FrameProbe`s.
  - `default rules classify like before`. One case per state: progressing video gives `PLAYING`; top URL `https://login.microsoftonline.com/...` gives `LOGIN_REQUIRED`; the line "maximum number of devices" gives `STREAM_LIMIT`; "not available in your area" gives `CHANNEL_UNAVAILABLE`; "Are you still watching?" gives `IDLE_PROMPT`; a video error whose message contains "license" gives `DRM_ERROR`; no progress past `startupSeconds` gives `STALLED`.
  - `custom limit rule`: rules with `limit: /streams are in use/i` and the line "All your streams are in use" give `STREAM_LIMIT`.
  - Policy: `adviseOnStream('STREAM_LIMIT', 0, 60).title === 'Xfinity stream limit reached'`, and `adviseOnStream('LOGIN_REQUIRED', 0, 60, 'Spectrum').title === 'Signed out of Spectrum'`.
- [ ] **Step 2:** Run `npx vitest run test/health.test.ts test/policy.test.ts`. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement.
  - Call sites become `frame.evaluate(\`(${PROBE_JS})(${JSON.stringify(patterns)})\`)`.
  - Every literal "Xfinity" in `policy.ts` becomes `${shortName}`. The `CHANNEL_UNAVAILABLE` hint keeps its campus-network sentence only for `shortName === 'Xfinity'`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor(health): error rules from provider config`.

### Task 3: Generic Tuner and the Comcast TV-APP driver

**Files:**
- Create: `src/windows/tuner.ts`
- Create: `src/providers/comcast/tvapp.ts`
- Create: `src/providers/comcast/adapter.ts`
- Delete: `src/windows/tune.ts`
- Test: `test/tuner.test.ts`, `test/providers/comcast.test.ts`

**Interfaces:**
- Consumes: `ProviderConfig` (Task 1).
- Produces (in `src/providers/types.ts`):
  ```ts
  export interface ChannelRef { name: string; number: number; callSign: string | null; ref: string | null }
  export type TunePath = 'in-app' | 'cached-url' | 'guide' | 'url';
  export interface TuneOutcome { path: TunePath; ms: number; url: string }
  export interface TuneTools {
    load(page: Page, url: string): Promise<void>; // full page load: one at a time, then timing.loadGapMs gap
    cached(ch: ChannelRef): string | null;
    remember(ch: ChannelRef, url: string): void;
    forget(ch: ChannelRef): void;
  }
  export interface DiscoveredChannel { label: string; number: number | null; callSign: string | null; ref: string | null }
  export interface ProviderAdapter {
    readonly config: ProviderConfig;
    tune(page: Page, ch: ChannelRef, tools: TuneTools): Promise<TuneOutcome>;
    onChannel(url: string, ch: ChannelRef): boolean;   // drift check; true when unknown
    isOnPlayer(url: string): boolean;
    isWarm(page: Page): boolean;                        // parked on the guide, no stream
    warm(page: Page, tools: TuneTools): Promise<void>;
    release(page: Page): Promise<boolean>;              // stop stream, stay in app; false = caller loads about:blank
    answerIdlePrompt(page: Page): Promise<boolean>;
    discoverLineup(page: Page, tools: TuneTools): Promise<DiscoveredChannel[]>;
  }
  ```
- `src/windows/tuner.ts`: `class Tuner { constructor(adapter: ProviderAdapter, cacheFile: string, opts: { fastPath: boolean }); tune(page, ch): Promise<TuneOutcome>; warm(page): Promise<void>; forget(ch): void }`. It also has `cacheFileFor(providerId: string, stateDir: string): string`, which returns `xfinity-urls.json` for `xfinity-on-campus` and `urls-<id>.json` otherwise. The cache key stays the channel number as a string, so the existing cache file is reused.
- `src/providers/comcast/adapter.ts`: `createComcastAdapter(cfg: ProviderConfig): ProviderAdapter`. Its tuning schema, `ComcastTuningSchema`, has:
  - `listingsUrl`, `livePathPattern` (`/stream/live/`)
  - selectors: `rowButton` (`tv-grid-row a[role=button]`), `channelNumber` (`tv-grid-row span.channel-number`), `closePlayer` (`#player button[aria-label="Close Player"]`), `continueWatching` (`#player button[aria-label^="Are you still watching? Continue"]`)
  - `guideErrorPattern` (`TVAPP-\d+|Something went wrong`)
  - timeouts: `inAppTimeoutMs` (8000), `guideTimeoutMs` (20000), `pageTimeoutMs` (30000), `closePlayerTimeoutMs` (5000)
  - search tuning: `findRowMaxSteps` (30), `findRowSettleMs` (180), `findRowHitSettleMs` (120), `findRowEmptyWaitMs` (250)
  - `callSignInUrl: true`

- [ ] **Step 1: Write the failing tests.**
  - `test/tuner.test.ts` uses a fake adapter whose `tune` records start and end times. Fake pages are `{ url(): string, goto() }`.
    - `at most 2 tunes at once`: start 4 tunes; at most 2 overlap.
    - `page loads are serialized with the configured gap`: two `tools.load` calls; the second starts ≥ `loadGapMs` after the first finishes. Use fake timers.
    - `remember/forget persist to the cache file`.
    - `cache file is per provider; XOC keeps legacy name`.
  - `test/providers/comcast.test.ts`:
    - `onChannel matches call sign at end of live URL`. `.../stream/live/x/123/ESPND` with callSign `ESPND` gives true, `.../ES2HD` gives false, and a null callSign gives true.
    - `isOnPlayer` is true for `/stream/live/` and false for listings.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. **Move** `FIND_ROW`, `waitForGuide`, `clickChannelInGuide`, `tuneByGuide`, `closePlayer` and `continueWatching` from `tune.ts` into `tvapp.ts`, with no logic changes. Literals become reads from `ComcastTuningSchema`. `tuneNow`'s three-path order moves into `adapter.tune`, also unchanged. Slots, the load chain and the cache move into `tuner.ts`.
- [ ] **Step 4:** Run the tests and typecheck. Expected: PASS. Compile errors in `screen.ts` and `controller.ts` are expected until Task 4. Do Tasks 3 and 4 back to back, and commit only once typecheck passes after Task 4.

### Task 4: Controller, ScreenWindow and app use the adapter and lineup

**Files:**
- Modify: `src/windows/screen.ts`, `src/windows/controller.ts`, `src/app.ts`, `src/windows/chrome.ts` (only if it uses the start URL), `src/config.ts`
- Create: `src/providers/lineup.ts`
- Test: `test/providers/lineup.test.ts`

**Interfaces:**
- Consumes: `ProviderAdapter`, `Tuner`, `ChannelRef` (Task 3); `loadProviderConfig` (Task 1).
- Produces:
  - `config.ts`: a top-level `provider: z.string().default('xfinity-on-campus')`. `ChannelSchema` gains `ref: z.string().optional()`. `OverridesSchema` gains `provider` and `standbyViews` (0–4). `electron.standbyViews` becomes `.optional()`.
  - `lineup.ts`:
    - `effectiveChannels(cfg: Config, providerId: string, stateDir: string): Config['channels']`. It returns the `.state/lineups/<id>.json` entries if that file exists, otherwise `cfg.channels` unchanged.
    - `channelRef(channels: Config['channels'], number: number): ChannelRef | null`.
  - `createAdapter(id: string, opts?): ProviderAdapter` in `registry.ts`, which picks the factory by `config.family` (Task 1).
  - `ScreenWindow.tuneChannel(ch: ChannelRef)` replaces `(channel, callSign)`. `ScreenWindow` gains `ref: ChannelRef | null` in place of `callSign`.
  - `ControllerOptions` gains `adapter: ProviderAdapter`. `cacheFile` is computed with `cacheFileFor`.

Controller replacements:

| Today | After |
|---|---|
| `LISTINGS_URL` in `takeSpare` | `adapter.isWarm` |
| `onCallSign` and the `'/stream/live/'` check in `checkScreen` | `adapter.isOnPlayer(url) && !adapter.onChannel(url, sw.ref)` |
| `tuner.warmGuide` | `tuner.warm` |
| `callSignOf` | `channelRef(this.channels, channel)` |
| the `20_000` warm delay | `timing.spareWarmDelayMs` |

ScreenWindow replacements:

| Today | After |
|---|---|
| `release()` calls `closePlayer` | `adapter.release` |
| `checkHealth()` calls `continueWatching` | `adapter.answerIdlePrompt` |

ScreenWindow also passes `errorRules`/`probePatterns` to the health tracker and `probePage`.

`app.ts` changes:
- Build the adapter from `cfg.provider` (after overrides) and use `effectiveChannels` everywhere `cfg.channels` is read.
- Feed `{ ...cfg, channels: effective }` into `Engine`, so the engine itself is unchanged.
- Info strings use `shortName`.

- [ ] **Step 1: Write the failing tests.**
  - `effectiveChannels returns config channels when no lineup file` (deep-equal).
  - `effectiveChannels prefers .state lineup file` (temp dir).
  - `channelRef finds name, callSign and ref by number`, and returns `null` for an unknown number.
- [ ] **Step 2:** Run `npx vitest run test/providers/lineup.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `lineup.ts` and the rewiring above.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: all PASS, including `test/replay.test.ts`.
- [ ] **Step 5:** Run `npm run sim -- --day 20261017 --compare > "$SCRATCH/sim-after.txt"` and `diff <(grep -v "^  ran " "$SCRATCH/sim-baseline.txt") <(grep -v "^  ran " "$SCRATCH/sim-after.txt")`. Expected: no differences.
- [ ] **Step 6:** Commit: `refactor(windows): drive screens through the provider adapter (Comcast TV-APP)`.

### Task 5: Network alias table and lineup matching

**Files:**
- Create: `src/providers/networks.ts`
- Test: `test/providers/networks.test.ts`

**Interfaces:**
- Produces:
  - `CFB_NETWORKS: { key: string; espnNames: string[]; guideNames: string[] }[]`. Keys equal today's `config/redzone.config.json5` channel keys: ESPN, ESPN2, ESPNU, ABC, CBS, NBC, FOX, FS1, FS2, SEC Network, ACC Network, Big Ten Network, CBS Sports Network, The CW, TNT, truTV, USA Network, plus ESPNews and FS2 aliases.
  - `normalizeGuideName(s: string): string`: lowercase; strip " hd", " (hd)", "east", "network" noise and punctuation.
  - `matchLineup(found: DiscoveredChannel[], localAffiliates?: Record<string, string>): Config['channels']`. Every `CFB_NETWORKS` key appears in the result; unmatched keys get `number: null`.
    - Services without channel numbers get synthetic numbers 1..N in guide order.
    - `callSign` and `ref` are copied from the found channel.

- [ ] **Step 1: Write the failing tests.**
  - `matches decorated guide names`: "ESPN2 HD", "FOX Sports 1", "Big Ten Network HD", "SEC Network" map to ES2/FS1/BTN/SECN.
  - `XOC-style rows keep their numbers and call signs`: `{label:'ESPN', number:849, callSign:'ESPND'}` gives `ESPN.number === 849` and `callSign === 'ESPND'`.
  - `missing networks are null`.
  - `synthetic numbers are stable in guide order`: the same input twice gives the same numbers.
  - `locals map via affiliate call signs`: `{label:'WCVB', callSign:'WCVBD'}` with `localAffiliates: { ABC: 'WCVB' }` maps to ABC.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(providers): network alias table and lineup matching`.

### Task 6: Provider-driven Electron shell

**Files:**
- Create: `electron/signin-rules.cjs`
- Modify: `electron/main.cjs`, `src/shell.ts`
- Test: `test/shell-provider.test.ts`

**Interfaces:**
- Consumes: `ProviderConfig`, `loadOverrides`.
- Produces:
  - `src/shell.ts`: `shellProvider(cfg: ProviderConfig): ShellProvider`, a plain JSON object with `{ partition, userAgent, appUrl, playerUrl, hideCss, hidePollMs, signin }`. `startShell` writes it to `.state/shell-provider.json` and passes `--provider=<abs path>`.
  - `src/shell.ts`: `effectiveStandby(overrides: SettingsOverrides, cfg: Config, provider: ProviderConfig): number`, resolved as override, then config, then provider default. It feeds `--spares` and `attachShell`.
  - `electron/signin-rules.cjs`:
    - `isApp(url, sp)` and `isPlayer(url, sp)`.
    - `signedOut(bodyText, sp)`, tested on the first 4000 chars.
    - `signinDone(windows: { url: string; bodyText: string }[], sp)`, true when any window is on `appUrl` and not signed out.
- `main.cjs` behavior: it requires the file named by `--provider` and replaces each Xfinity literal.

  | Literal | Replacement |
  |---|---|
  | `PARTITION` | `sp.partition` |
  | `isXfinity` | `isApp` |
  | `HIDE_JS` player test | `isPlayer`, plus an injected `sp.hideCss` |
  | the interval | `sp.hidePollMs` |
  | the `useChromeUserAgent` call | only when `sp.userAgent === 'chrome'` |
  | the `handoff()` URLs, texts, tries and timeouts | `sp.signin` |

  - When `sp.signin.portalUrl` is null, the sign-in window is shown at `checkUrl` with no auto-click, and `signinDone` is polled every 1000 ms across all windows of the partition.

- [ ] **Step 1: Write the failing tests.**
  - `XOC shell provider equals today's constants`: `partition 'persist:xfinity'`; `appUrl` matches `https://www.xfinity.com/stream/listings` but not `https://www.xfinityoncampus.com/`; `isPlayer` is true for `/stream/live/a/1/ESPND`; `signin.checkUrl === 'https://www.xfinity.com/stream/'`; `autoClick.selector === 'a.watch-now-btn'`; `checkSettleMs === 4000`; `waitForUserMs === 600000`.
  - `signinDone checks every window`: `[{url:'https://idp.school.edu/sso', bodyText:''}, {url:'https://www.xfinity.com/stream/', bodyText:'Live TV'}]` gives true; the same windows with `'Sign In'` in the second give false.
  - `effective standby resolution`: `({standbyViews:2}, cfg{}, provider{0}) → 2`; `({}, cfg{standbyViews:2}, …) → 2`; `({}, cfg{}, provider{0}) → 0`.
- [ ] **Step 2:** Run `npx vitest run test/shell-provider.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Remove `standbyViews: 2` from `config/redzone.config.json5`, keeping a commented example.
  - Write `{"standbyViews": 2}` into the owner's `.state/settings.json` (merge with existing keys).
- [ ] **Step 4:** Run `npm test` and typecheck. Expected: PASS. Run `npx tsx scripts/shell-check.ts` (dry window, no streams). Expected: the window opens, logs `ready`, and shows no errors.
- [ ] **Step 5:** Commit: `refactor(electron): shell reads provider config; standby default from provider`.

### Task 7: Verify Xfinity On Campus with the owner's account (gate)

**Files:**
- Create: `scripts/provider-check.ts` (`"provider-check": "tsx scripts/provider-check.ts"` in package.json)

**Interfaces:**
- `npm run provider-check -- <id> [--signin] [--scan] [--tune ESPN,ESPN2,ABC,FOX] [--views N]`. It starts the shell with N views (default 1, no spares) and attaches to it.
  - `--signin`: runs the hand-off and prints the state.
  - `--scan`: calls `adapter.discoverLineup`, prints `matchLineup` output, and with `--save` writes `.state/lineups/<id>.json`.
  - `--tune`: tunes each channel in turn and prints path, ms, `onChannel` and health after 10 s.

- [ ] **Step 1:** Implement `provider-check.ts`. Typecheck passes.
- [ ] **Step 2:** Automated gate. Run `npm test` and `npm run typecheck`, plus the sim diff from Task 4 Step 5. Expected: all pass, no diff.
- [ ] **Step 3: Ask the owner.** The owner must be on the campus network. Ask: "OK to run live Xfinity now?"
  - On yes, run `npm run provider-check -- xfinity-on-campus --signin --tune ESPN,ESPN2,ABC,FOX --views 4`.
  - Expected: sign-in `ok` with no window shown; every tune lands (`onChannel` true) and is PLAYING; paths are `guide` or `cached-url` first, then `in-app`.
- [ ] **Step 4:** With the owner, run `npm start` and check:
  - [ ] four screens play
  - [ ] a game-list pick switches in ~4–5 s (`in-app`)
  - [ ] "Back to my game" is instant (standby swap)
  - [ ] halftime reel in standby (if a game is at halftime; otherwise `--replay` is not applicable, so note "not exercised")
  - [ ] the overlay and hidden Xfinity UI look identical
  - [ ] the sign-in chip shows at start
- [ ] **Step 5:** Run `npm run switch-stats -- --since <start time>`. Expected: in-app median within ±0.5 s of 4.2 s; standby swap 0.0 s. Record the numbers in the commit message.
- [ ] **Step 6:** Commit: `test: XOC verified through the provider adapter (live, <date>)`. **Stop here** if anything regressed: fix it before Task 8.

### Task 8: Xfinity Stream (consumer) and Cox Contour adapters

**Files:**
- Create: `config/providers/xfinity-stream.json`, `config/providers/cox-contour-campus.json`, `config/providers/cox-contour.json`
- Test: extend `test/providers/config.test.ts`

**Interfaces:**
- Consumes: `createComcastAdapter` (Task 3), `ProviderConfigSchema`.

**Per-provider values**

- **xfinity-stream**
  - `family: 'comcast'`, status `experimental`, kind `consumer`, `documentedMaxStreams: 5`.
  - `signin.portalUrl: null`, `checkUrl: 'https://www.xfinity.com/stream/'`, `instructions: 'Sign in with your Xfinity ID, then wait for the guide to appear.'`
  - Same tuning as XOC; partition `persist:xfinity-stream`.
- **cox-contour-campus and cox-contour**
  - `family: 'comcast'`, `documentedMaxStreams: 1` (campus) and `null` (consumer).
  - App URLs `campus.cox.com` and `watchtv.cox.com`.
  - Listings and live paths: **look up** in PrismCast `src/browser/tuning/cox.ts` and `comcastPolymer.ts`. Reference only; write our own code and config.
  - Mark unverified values in `notes`.

- [ ] **Step 1: Write the failing tests.**
  - `consumer adapters never auto-click`: for every provider except `xfinity-on-campus`, `signin.autoClick === null`.
  - `comcast family providers build an adapter`: `createAdapter(id).config.id === id` for all three.
  - `experimental providers default to 0 standby` (all non-XOC).
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Add the JSON files. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(providers): experimental Xfinity Stream and Cox Contour adapters`.

### Task 9: Spectrum adapters (SpectrumU and Spectrum TV)

**Files:**
- Create: `src/providers/spectrum/adapter.ts`, `config/providers/spectrumu.json`, `config/providers/spectrum-tv.json`
- Test: `test/providers/spectrum.test.ts`

**Interfaces:**
- Produces:
  - `createSpectrumAdapter(cfg): ProviderAdapter`.
  - `SpectrumTuningSchema`: `{ liveUrl: 'https://watch.spectrum.net/livetv?tmsid={ref}', guideUrl, guideRow: 'li.channel-header-row:not(.nonstreamable)', logoTmsidPattern: '/guide/(\\d+)\\?', pageTimeoutMs: 30000 }`.
  - `tmsidFromLogoUrl(url: string, pattern: RegExp): string | null`.
- Behavior:
  - `tune` → `tools.load(page, liveUrl with ref)`, path `'url'`; throws `'<name>: no station id for <channel>; run a lineup scan'` when `ref` is null.
  - `onChannel` → URL `tmsid` equals `ch.ref`. `isOnPlayer` → `/livetv`. `release` → `false` (caller blanks the page). `isWarm` → false. `warm` → no-op.
  - `discoverLineup` → load `guideUrl`, read the rows (label, channel number if shown, tmsid from the logo `src`).
- Values:
  - spectrumu: `documentedMaxStreams: null`; notes "multiple on campus, 1 off campus (school pages)"; `search` lists the schools from the research §2.2.
  - spectrum-tv: kind consumer.
  - Both: `appUrl ^https://watch\.spectrum(utv)?\.net/`.

- [ ] **Step 1: Write the failing tests.**
  - `tmsidFromLogoUrl extracts the station id` (`'https://x/guide/12345?w=80'` → `'12345'`, garbage → null).
  - `onChannel compares tmsid`.
  - `tune without ref explains how to fix it`: a fake page and fake tools; the rejection message includes "lineup scan".
  - `tune loads the tmsid URL`: the fake `tools.load` receives `https://watch.spectrum.net/livetv?tmsid=12345`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(providers): experimental Spectrum adapters`.

### Task 10: YouTube TV sign-in spike, then the adapter

**Files:**
- Create: `config/providers/youtube-tv.json`
- Create, only if the spike passes: `src/providers/youtube-tv/adapter.ts`
- Test: `test/providers/youtube-tv.test.ts`

- [ ] **Step 1:** Add `youtube-tv.json` with `status: 'experimental'`, `family: 'youtube-tv'`, `signin.checkUrl: 'https://tv.youtube.com/'`, `signedOutPattern: '\\bSign in\\b'`, `userAgent: 'default'`. Start with the real Electron user agent; try `'chrome'` only if YouTube TV itself rejects the browser.
- [ ] **Step 2: Spike (owner).** Ask the owner to run `npm run provider-check -- youtube-tv --signin` and sign in with any Google account, typing their own credentials.
  - Record the outcome: signed in, or Google's "This browser or app may not be secure".
  - **If blocked:** set `status: 'unsupported'` and `notes` to the exact message. Skip Steps 3–6. Do **not** try user-agent tricks, stealth flags or a detached debugger to get around it.
- [ ] **Step 3: Write the failing tests.**
  - `watchIdFromHref` (`'/watch/niY10UGQat0'` → `'niY10UGQat0'`; `'watch/abc'` → null; IDs are 11 chars `[A-Za-z0-9_-]`).
  - `tune loads /watch/<ref>`.
  - `onChannel compares the watch id`.
- [ ] **Step 4:** Implement `createYouTubeTvAdapter`.
  - `YouTubeTvTuningSchema`: `{ guideUrl: 'https://tv.youtube.com/live', channelLink: 'ytu-endpoint.tenx-thumb[aria-label^="watch "]', watchUrl: 'https://tv.youtube.com/watch/{ref}' }`.
  - The hide script already shows only the largest *playing* video, which handles the page's many `<video>` elements.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(providers): YouTube TV adapter (experimental)`, or `chore(providers): YouTube TV marked unsupported (Google blocks embedded sign-in)`.

### Task 11: Sling TV adapter

**Files:**
- Create: `src/providers/sling/adapter.ts`, `config/providers/sling.json`
- Test: `test/providers/sling.test.ts`

**Interfaces:**
- `SlingTuningSchema`: `{ guideUrl: 'https://watch.sling.com/dashboard/grid_guide/grid_guide_a_z', watchUrl: 'https://watch.sling.com/1/channel/{ref}/watch', guideResponsePattern: 'grid_guide_a_z', guidJsonPath: string, nameJsonPath: string }`.
- `guidsFromGuideJson(json: unknown, paths): DiscoveredChannel[]`.
- `discoverLineup` reads the page's **own** guide API response (`page.waitForResponse` matching `guideResponsePattern`), which is read-only. `tune` → `'url'` path.
- `documentedMaxStreams: null` (it depends on Orange vs Blue). `notes`: "Orange: 1 stream; Blue: 3; Orange & Blue: 4."
- Sling's guide URL path and JSON shape are **unverified**. Look them up in CH4C `services/sling-service.js` and PrismCast `sling.ts` (reference only). Test with a minimal fixture written from that shape and mark it as such.

- [ ] **Step 1: Write the failing tests.**
  - `guidsFromGuideJson reads guid and name via configured paths`.
  - `rejects non-32-hex guids`.
  - `tune loads /1/channel/<guid>/watch`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(providers): experimental Sling TV adapter`.

### Task 12: Docs and final checks

**Files:**
- Modify: `CLAUDE.md` (architecture: `src/providers/`, `config/providers/`, `.state/providers/`, `.state/lineups/`, `provider-check`)
- Modify: `README.md` (short "Services" table: id, status, documented streams; "Personal use only" kept; non-affiliation line)

- [ ] **Step 1:** Update both docs. The README user-facing setup and onboarding stay for Stage 3.
- [ ] **Step 2:** Run `npm test`, `npm run typecheck`, and the sim diff again. Expected: all pass, no diff.
- [ ] **Step 3:** Commit: `docs: provider adapters`.
- [ ] **Step 4:** Whole-branch review (superpowers:requesting-code-review), then superpowers:finishing-a-development-branch.

---

## Planned for Stage 3: the easy install path (decision 4)

This is not Stage 2 work. It's recorded here so Stage 2 doesn't block it. The aim: a student downloads the source and **double-clicks one file**.

1. **`Setup RedZone.cmd`** runs `scripts/setup.ps1`, which:
   - Checks Node ≥ 22 and Python 3.12. If one is missing, it explains why and offers `winget install` (the user confirms in the window).
   - Runs `npm ci`.
   - Creates a private venv (`.venv-evs`) and installs a pinned `castlabs-evs` plus `truststore`. A tiny wrapper calls `truststore.inject_into_ssl()` so antivirus "web shields" stop breaking EVS: the current `CERTIFICATE_VERIFY_FAILED` workaround becomes automatic. Needs verifying with Norton.
   - Runs castLabs' own interactive EVS sign-up or re-auth. The user types into castLabs' CLI; RedZone never reads it.
   - Signs the Electron binary and checks that `electron.exe.sig` exists.
   - Adds a Start-menu and desktop shortcut "RedZone" that starts the app without a console window, then launches it straight into onboarding.
2. **`npm run doctor`:** checks the signature, the Widevine CDM, the provider config and the network, with a one-line fix for each problem.
3. **`postinstall`:** after any Electron update, says "re-sign needed" and offers to run it.
4. **`Update RedZone.cmd`:** `git pull` when git is available, then `npm ci`, then re-sign only if Electron changed.
5. **Open question for the owner:** macOS. Many students use Macs, castLabs supports macOS VMP, and the app is Windows-only today (paths, DirectComposition flag, EVS signing order). It needs its own decision.
