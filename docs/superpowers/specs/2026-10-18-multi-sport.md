# RedZone Director: multi-sport plan

## Context

RedZone Director only handles college football. The sport is fixed by `cfg.espn.sport`/`groups`, and football rules run through the whole stack: the normalizer, `gameStore` inference, the forecast categories, the ranker (red zone, 15-minute quarters), the director's red-zone upgrade, synth, sim metrics, the network list (hard-coded in 4+ places), highlights and the UI.

The goal is a multi-sport director:
- **Sport modules:** each sport and level (NFL ≠ CFB, NBA ≠ men's college ≠ women's college ≠ WNBA, NHL, MLB, soccer) has its own module with its own break detector and excitement scorer.
- **Sport picker:** pick a sport per screen, or one sport for all screens.
- **3-tier fill-in:** same sport → a sport shown on another screen → any sport.

**College football must behave exactly as it does today on CFB-only data.**

### What the recon found (ESPN data, 10/18)

- **Every sport has play-by-play with wallclock times**, so the existing empirical approach carries over to each sport: measure real stoppage lengths per category, then forecast from them (`forecast.ts` survival model).
- **Several sports mark TV breaks explicitly in the data:**
  - Men's and women's college basketball: an `OfficialTVTimeOut` play.
  - WNBA: an `Official Timeout` play.
  - NHL: a `Stoppage` play with the text "TV Timeout".
- **Measured gaps** (stoppage → next live play):

  | Sport (games) | Stoppage | Median | ≥ 90 s |
  |---|---|---|---|
  | MCBB (30) | official TV timeout | 209 s | 96% |
  | MCBB | short timeout | 100 s | 60% |
  | MCBB | foul | 29 s | 13% |
  | MCBB | made basket | 20 s | 6% |
  | WCBB (25) | official TV timeout | 200 s | 96% |
  | WCBB | end of Q1 / Q3 | ~200 s | 96% |
  | NBA (25) | team (full) timeout | 185 s | 87% |
  | NBA | end of Q1 / Q3 | ~178 s | 100% |
  | NBA | foul | 29 s | 4% |
  | WNBA (7) | official timeout | 202 s | 92% |
  | WNBA | team timeout | 123 s | 78% |
  | NHL (16) | TV Timeout | 150 s | 100% |
  | NHL | penalty | 64 s | 37% |
  | NHL | goal | 50 s | 7% |
  | NHL | icing | 31 s | 1% |
  | MLB (12) | end of half-inning | 147 s | 100% |
  | MLB | pitching change (ESPN timing) | 26 s | 17% |
- **Soccer:** play-by-play is in `keyEvents`/`commentary`, not `plays`. MLS games are on Apple TV, which no cable lineup carries, so EPL/UCL/La Liga on USA/NBC/CBS/ESPN matter more.
- **Your saved Xfinity guide scan (`.state/lineups/xfinity-on-campus.scan.json`, 753 channels) already has:** NESN, NBC Sports Boston, NBA TV, NHL Network, MLB Network, NFL Network, TBS, Telemundo, Univision and Fox Deportes. The lineup for the new networks can be rebuilt from that file, with no live re-scan.
- **NFL:** ESPN marks every Sunday CBS/FOX game "national". **NHL and MLB** list home/away regional networks (NESN, MSG, YES, "NBC Sports BA"…). **Many NBA games list no broadcast at all**; those are greyed out with the reason "no TV listing".

## Decisions you made (10/18)

1. **MLB half-innings** switch at Medium and High only. At Low, baseball screens stay put between innings.
2. **NFL regional windows:** automatic picks use only confirmed games. Confirmed means your market's team (config: `market: "Boston"`, so the Patriots) or a game whose title matches the TV guide's program title for that channel. Unconfirmed games show a warning but can still be picked by hand.
3. **All screens same sport:** each screen not already on that sport auto-picks the best distinct game of it. You can change any screen's game afterward.
4. **Sensitivity:** the global Low/Med/High control applies each sport's own numbers. The settings drawer also has "Advanced: per sport" overrides, each defaulting to "Same as global".

## Architecture

### 1. Sport modules: `src/sports/`

`src/sports/types.ts`:

```ts
interface SportModule {
  id: SportId;                 // 'cfb' | 'nfl' | 'mcbb' | 'nba' | 'nhl' | 'mlb' | 'wcbb' | 'wnba' | 'mls' | 'epl' | 'ucl' | 'laliga'
  name: string; short: string; level: 'pro' | 'college'; family: 'football' | 'basketball' | 'hockey' | 'baseball' | 'soccer';
  icon: IconKey;               // our own glyph per family + a text label ('NCAA', 'NFL', 'NBA'…); no league logos
  espn: { path: string; groups?: string };      // 'football/college-football' + '80'
  // parsing → common model
  phaseOf(statusName, state, detail, period): Phase;      // intermission → HALFTIME; MLB has none
  situationOf(comp, home, away): LiveSituation | null;    // family-tagged union (below)
  plays(summaryBody): PlaySnap[];                          // drives (football), plays (bb/hockey/mlb), keyEvents (soccer)
  classifyPlay(typeText, scoring, scoreValue): PlayKind;
  inferFromScoreboard?(prev, snap): InferredEvent[];       // football: timeout counters / quarter jumps; MLB: "Mid 4th"
  // breaks
  breakModel: { file: string; categories: readonly string[]; labels: Record<string,string>;
                categorize(lastPlay, prev): string | null; resumes(kind/play): boolean };
  presets: Record<'low'|'medium'|'high', SportPreset>;    // minBreakSeconds, confidence, replaceIfHomeRemainingSeconds,
                                                           // upgradeToHot, excludeCategories (MLB low: ['halfInning'])
  // excitement
  excitement(g: GameSnapshot, plays): { score: number /*0–100*/; hot: string | null; why: string };
  compare(a, b): number;       // same-sport ordering (CFB: today's exact comparator)
  progress(g): number;         // 0..1 (+ seconds for logs)
  // halftime / highlights
  halftimeMaxSeconds: number; highlights: { playPattern: RegExp; youtubeChannels: string[]; query(g): string };
  synth(finalSummary): SynthGame | null;                   // for fetch-day days
}
```

- **Registry:** `src/sports/index.ts` exposes `SPORTS`, `sportOf(id)` and `enabledSports(cfg)`.
- **Shared code per family:** families share helpers (`sports/football.ts`, `basketball.ts`, `hockey.ts`, `baseball.ts`, `soccer.ts`). For example, CFB and NFL use the same football parser with different models, presets and labels.
- **CFB module = today's code, moved, not rewritten:**
  - `normalize.ts` football parts → `sports/football.ts`
  - `forecast.categorize` → the CFB break model
  - the ranker comparator → `cfb.compare`
  - `progressSeconds` stays as-is
  - The football-specific `gameStore` inference moves behind `inferFromScoreboard` with identical logic.

### 2. Common game model (`src/engine/types.ts`)

- `GameSnapshot` gains `sport: SportId`.
- `situation` becomes a union tagged by `family`. The football variant keeps every current field (`down`, `yardsToEndzone`, `isRedZone`…). New variants:
  - basketball: possession, bonus
  - hockey: strength (`PP`/`SH`/`EN`, power-play team)
  - baseball: half, outs, balls, strikes, bases, hits per team
  - soccer: added time
- Readers of `situation.isRedZone` (ranker, director upgrade, UI, pages) switch to the generic `excitement.hot`. The red outline then means "hot moment" in every sport: red zone, power play, clutch time, bases loaded late.
- Game ids stay raw ESPN event ids (one global id space), so logs, labels and `--homes` keep working. `GameStore` warns and namespaces only if two sports ever collide.
- `PlayKind` stays as-is, with `snap` documented as "any live action".

### 3. Engine (still pure and clock-injected)

- **Detector per sport:** `Engine.detector()` picks options per game by `g.snap.sport`: that sport's model, its preset (global sensitivity unless a per-sport override is set), and `excludeCategories`.
- **Generic forecast detector:** `forecastDetector` takes `categorize`/`resumes` from the module instead of importing football ones. `statusOutcome` is unchanged.
- **Classic detector:** stays CFB-only, for `--model classic` comparisons. Other sports always use the forecast detector.
- **`GameView`** gains `sport` and `excitement`.
- **3-tier ranker:** `rankCandidates` gets `homeSport` and `otherScreenSports`.
  - Every eligible candidate is tagged with a tier:
    - tier 1: same sport
    - tier 2: a sport that is the home sport of another screen
    - tier 3: any enabled sport
  - Eligibility is unchanged: in play, on a lineup channel, not in its own stoppage.
  - Duplicates: today's rule runs first (avoid games shown elsewhere unless nothing else is left). Then the lowest-numbered tier wins.
  - Order within tier 1 is `module.compare`. Within tiers 2 and 3 it is normalized excitement, then id.
  - On a CFB-only day every candidate is tier 1 with today's comparator, so the ranking is identical.
- **Director:** unchanged state machine. Changes:
  - The `pick:` reason becomes `Same sport: red zone, UTAH 7–0 COLO 2:10 4th`, `Other screen's sport (NHL): power play, BOS 2–2 TOR 3rd`, or `Other sport (NBA): clutch, 4:12 4th`.
  - Decisions gain `tier`.
  - `FILL_UPGRADE` (High only) upgrades to a same-sport hot moment.
  - The halftime reel also covers intermissions.
  - Game-over auto-pick prefers the same sport.
- **New invariant (6):** a fill-in's tier must be the best tier that had an eligible, non-duplicate candidate at that tick.

### 4. Data: sources, recording, replay

- **`EspnClient`** takes a league path (`espn.path`/`groups` per call, not per client).
- **`LiveSource`:** one scoreboard loop per enabled sport. It polls `scoreboardLiveSeconds` while that sport has live games, `scoreboardIdleSeconds` otherwise, and every 15 min on days with no games. The summary tiers stay global: on-screen games are hot, likely substitutes come from `interestingGameIds` (tier order first), and `maxSummaryGames` stays the cap.
- **Recordings:**
  - Every record gets a `sport` field; records without one are read as `cfb`, so old recordings replay unchanged.
  - Same files, so `mergeByTime` and the replay code stay as they are.
  - `npm run record -- --sports all|cfb,nhl…`
- **`fetch-day -- <date> [--sports …]`:** per-sport finals. **Synth** becomes per family: football keeps today's `synth.ts`, and new synthesizers build basketball, hockey, baseball and soccer days from final play-by-play. That way out-of-season sports (college basketball, WNBA) are tested on past days (Feb–Mar / Aug 2026).
- **Break models:** `npm run build-break-model [--sport x]` writes `config/break-models/<id>.json`. The CFB file moves there byte-identical, and the old `switching.modelFile` key is still honored.

### 5. Channels and networks

- **One network catalog:** `CFB_NETWORKS` becomes `NETWORKS` in `providers/networks.ts`, with each entry tagged by the sports it carries. It covers national networks plus common regional ones, with ESPN names, guide names and call signs: NESN, NBC Sports Boston/BA/Phil, MSG/MSGSN, YES, Marquee, MNMT, CHSN, FanDuel SN, SNY, Root…
- **Single source of truth:** `TEST_ORDER`, `NETWORK_ORDER`, `lineupEdit` and the setup/diagnostics copy all read the catalog. "college-football networks" becomes "sports networks".
- **Lineup upgrade:** add the new networks to `.state/lineups/<id>.json` from the saved `.scan.json` (`lineupFromScan`). Existing entries, including your manual edits, are never changed. With no scan file, the settings page says "Re-scan channels to add NBA/NHL/MLB networks".
- **NFL regional windows (`src/sports/nfl.ts` + adapter hook):**
  - **Window:** CBS or FOX with 2+ NFL games starting within 30 minutes of each other.
  - **Confirmed** means one of:
    - your market's team plays (`config.market` → a team list in `config/markets.json`, starting with Boston plus the other NFL markets);
    - the provider's guide program title for that channel names a team in the game. This uses a new optional `ProviderAdapter.programTitle(channel)`, read from guide DOM the adapter already loads.
  - **Unconfirmed** games get `channel.regional = 'unconfirmed'`. The ranker skips them; the picker shows them with "Regional: may not be your local game".
  - Xfinity's title read needs one live Sunday check, and I'll ask before running `provider-check`.

### 6. Sport proposals (starting thresholds; tuned with `npm run sim` per sport)

Every sport's model is built from real gaps (§4). The numbers below are starting points, refined on sim runs of past days and reported back.

| Sport | Immediate BREAK (Low) | Only after quiet / higher sensitivity | Never on its own | Halftime / reel | Excitement (hot moments → 0–100) |
|---|---|---|---|---|---|
| **CFB** | unchanged | unchanged | unchanged | unchanged | red zone; closeness × lateness (today's comparator in-sport) |
| **NFL** | end of Q1/Q3, **two-minute warning**, kickoff after score, injury | team timeout, change of possession (TV timeouts show as quiet) | incompletion, OOB, penalty | halftime (~13 min) | red zone, two-minute drill in one-score game, OT |
| **MCBB** | official TV timeout (under 16/12/8/4), end of 1st half → halftime | short/team timeout after ~45–60 s quiet | fouls, free throws, made baskets | halftime | "crunch time": ≤ 6 pts under 4:00 of 2nd half; lead changes in last 5 min; OT |
| **NBA** | full timeout, end of Q1/Q3 | quiet after foul/review (mandatory timeouts look like full timeouts) | fouls, made baskets | halftime | clutch (≤ 5 pts, last 5:00 of Q4/OT, NBA's definition); OT |
| **NHL** | TV Timeout stoppage | penalty, goal, other stoppages after ~75 s quiet | icing, offside, goalie freeze | **1st/2nd intermissions** (and OT intermission) → reel | power play, empty net (pulled goalie), one-goal game in 3rd, OT/shootout |
| **MLB** | (Low: none) Medium/High: end of half-inning | pitching change, mound visit, review via quiet | between batters | none (rain delay = DELAYED) | runners in scoring position (more in innings 7+), close (≤ 2 runs) late, no-hitter through 6+, extra innings |
| **WCBB** | official TV timeout (first dead ball under 5:00 of each quarter), end of Q1/Q3 | short/team timeout via quiet | fouls, baskets | halftime | crunch time (≤ 6 pts, last 4:00 of Q4), OT |
| **WNBA** | official timeout, full timeout, end of Q1/Q3 | quiet | fouls, baskets | halftime | clutch, OT |
| **Soccer** (if time) | none during play | none | everything | halftime | ≤ 1 goal from 75'; stoppage time; good tier-2/3 destination |

- **Normalized score (same formula for every sport):** `100 × closeness × (0.35 + 0.65 × lateness) + hot bonus (≤ 30) + OT bonus`, clamped to 0–100.
  - `closeness = 1 − margin / sportScale` (football 17, basketball 15, hockey 3, baseball 5, soccer 3)
  - `lateness = progress` (0 to 1)
- **Calibration:** on replays, the 75th percentile of each sport's live moments should land near the same score, so "Other sport" picks compare fairly. The calibration table goes in the report.
- **Highlights:** each module supplies its ESPN clip pattern and a YouTube allowlist (official league and network channels) plus the query `"<away> vs <home> highlights <league>"`. The reel orders clips home game first, then same sport, then other sports.

### 7. UI (Preact, `src/ui/`)

- **Game menu (`screen.tsx` `GameMenu`), step 1, sport list:**
  - A grid of icon + name + "N games · M live".
  - Sports with no games today are greyed with "No games today".
  - A checkbox at the bottom: **"Use for all screens"**.
- **Game menu, step 2, games:** the chosen sport's games first (Live now / Later today, as today), then other sports under group headers. Search stays, and "← Sports" goes back. The menu opens on step 2 for the screen's current sport.

  ```
  [← Sports]  🏒 NHL · 6 games         [search…]
  LIVE NOW
    BOS 2–2 TOR  3rd 8:14 · NESN  POWER PLAY
    ...
  LATER TODAY
    ...
  ── NFL (3 live) ──
  ── MLB (1 live) ──
  ```
- **Screen header:** sport glyph + short label (`NHL`) before the score line. `gameClock()` gets per-family formats: "3rd 8:14", "Bot 7th · 2 out", "78'+2".
- **Why line:** `Showing … · Same sport: close game, 2:10 left`, or `· Other sport: NHL power play`.
- **Game-over pop-up:** same sport first, then other sports grouped.
- **Data tile (`pages.ts`):** per family. Football field (unchanged), basketball scoreboard + bonus, hockey strength bar, baseball diamond + count, soccer minute.
- **Settings drawer:**
  - sensitivity text per sport
  - "Advanced: per sport" level overrides
  - an "enabled sports" list (polled / offered / used as fill-ins, all on by default)
- **Persistence:** each screen's sport and the per-sport overrides persist in `.state/settings.json`.
- **Startup:** each screen's remembered sport (default CFB) runs today's `autoHomes` within that sport, falling back across sports by normalized score.

### 8. Config (`src/config.ts` + `config/redzone.config.json5`)

```json5
sports: {
  enabled: ['cfb','nfl','mcbb','nba','nhl','mlb','wcbb','wnba'],
  market: 'Boston',
  overrides: { /* nhl: { sensitivity: 'medium', presets: { low: { confidence: 0.8 } } } */ },
}
```

- **Defaults** live in each module and are deep-merged with `sports.overrides.<id>` (zod-validated).
- **Back-compat:** existing `switching.presets` / `espn.sport` still apply to CFB.
- `breakDetector.streamDelaySeconds` / `dataDelaySeconds` stay global, with an optional per-sport override.

## Staged delivery (branch `multi-sport`, one commit or more per stage)

**Stage A: refactor, CFB only, behavior frozen**
1. **Golden first (before touching code):** a new test, `test/cfb-golden.test.ts`, runs today's code over both CFB days:
   - `replay-20261017` from 18:45
   - `finals-20261017` synth, Low and classic
   It saves the full decision sequence (`at, screen, rule, switched, gameId, duplicate`) and the assessment-change sequence to `test/fixtures/golden/cfb-*.json`. Config: `loadConfig()`, sports forced to `['cfb']`.
2. Move the CFB code into `src/sports/` + the `SportModule` interface. Generic forecast detector, ranker tiers, `sport` on snapshots and recordings.
3. **Gate:** `npm test` (incl. `replay.test.ts` and the golden test, which must be identical), `npm run typecheck`. Also `npm run sim -- --day 20261010 --synth --compare` and `--day 20261017 --to 21:30 --compare`, whose numbers must match the README tables exactly.

**Stage B: multi-sport plumbing**
- Client/source/recorder/fetch-day/synth per sport, network catalog + lineup upgrade, 3-tier ranker + why line + invariant 6.
- UI: sport picker, all-screens, header, grouped dropdown/pop-up, per-family tiles, settings.
- Hand-written director tests for the 3-tier order (`snap`/`view` builders gain `sport`):
  - same sport beats a hotter other sport
  - tier 2 beats tier 3
  - nothing → stay home
  - duplicates still avoided
  - dwell and locks respected

**Stage C: sport modules, in order: NFL → MCBB → NBA → NHL → MLB → WCBB → WNBA → soccer (if time)**

For each sport:
1. Fetch past days (ESPN reads only).
2. Build its break model.
3. Implement the module.
4. Write unit tests for the detector and excitement scorer on trimmed recorded fixtures (`test/fixtures/sports/<id>/`, a few games each, < ~5 MB total).
5. Run the sim on its days and tune the presets.

Data days: NFL Sundays 9/13–10/18/2026; MCBB/WCBB Feb–Mar 2026; NBA Jan–Mar 2026 plus this week's opening nights; NHL 10/2026; MLB 8–9/2026; WNBA 8/2026; soccer 10/2026.

I'll also run the multi-sport recorder in the background tonight (SNF + NHL + MLB; ESPN reads only, no streams) for a real live mixed-sport recording.

**Stage D: mixed-sport replay + report + docs**
- **Mixed fixture:** the golden CFB window of 10/17 (18:45–19:15) plus the synthesized NHL day of 10/17 (seven games start at 19:00 ET), and the 10/18 day (NFL + NHL + MLB). `test/mixed-replay.test.ts` asserts:
  - invariants 1–6
  - each tier fires
  - tier-1 picks whenever same-sport candidates existed
  - no switch while every candidate is in a stoppage
- **Per-sport report:** `npm run sim -- … --by-sport`. For each home sport:
  - switches and switches per screen-hour
  - average time away per fill
  - suspected false switches: home resumed < 45 s after the switch (today's "short fill" metric, with per-sport resume kinds)
  - long breaks caught
  - fills by tier
- **README:** supported sports table (status per sport), how the 3 tiers work, per-sport switching rules with the measured numbers, and "Adding a sport" (module checklist: module file, model build, fixture, tests, network catalog entries).
- Commit the approved design as `docs/superpowers/specs/2026-10-18-multi-sport.md`.

## Critical files

- **New:**
  - `src/sports/{types,index,football,basketball,hockey,baseball,soccer}.ts`
  - `src/sports/<id>.ts` per sport
  - `src/espn/synth/<family>.ts`
  - `config/break-models/*.json`, `config/markets.json`
  - tests `test/sports/*.test.ts`, `test/cfb-golden.test.ts`, `test/mixed-replay.test.ts`
- **Changed:**
  - engine: `src/engine/{types,engine,gameStore,forecast,forecastDetector,ranker,director,invariants}.ts`
  - espn: `src/espn/{client,normalize,source,recording,synth}.ts`
  - `src/{app,sim,simMetrics,config,channels}.ts`
  - providers and setup: `src/providers/{networks,lineup,types}.ts`, `src/setup/{runner,lineupEdit,diagnostics}.ts`
  - server and highlights: `src/server/{state,pages}.ts`, `src/highlights/*`
  - UI: `src/ui/{screen,main,settings,util,icons,onboarding,diagnostics}.tsx|ts`
  - scripts: `scripts/{record,fetch-day,build-break-model,sim}.ts`
  - `test/helpers.ts`, `config/redzone.config.json5`, `README.md`
- **Reused, not rewritten:**
  - `forecast.ts` survival/`forecastBreak` (generalized category keys)
  - `statusOutcome`
  - `mergeByTime`/`replayRecords`
  - `lineupFromScan`/`matchLineup`
  - `resolveChannel`
  - `autoHomes`
  - `computeMetrics`
  - `InvariantChecker`

## Verification

1. **CFB unchanged:**
   - The golden decision/assessment sequences are identical.
   - `test/replay.test.ts` passes.
   - The sim `--compare` numbers for 10/10 and 10/17 match the README.
2. **Every stage:** `npm test` and `npm run typecheck`.
3. **Per-sport unit tests** on recorded fixtures (detector categories and timing, excitement scores and hot flags).
4. **Mixed-sport replay test:** 3-tier order and invariants.
5. **UI:**
   - `npm start -- --replay 20261018 --synth --from 16:00 --speed 10` (data tiles, no streams), driven in the in-app browser at `localhost:7480/ui`.
   - Check: sport list with counts and greyed sports, per-screen and all-screens selection, header glyphs, grouped dropdown and pop-up, the why line with its tier.
   - Plus `npm start -- --dry-run` on live data.
6. **Not run without asking:** plain `npm start` (live streams), `provider-check` live (NFL guide-title check), `sign-electron`.

## Calls I made (check these)

- **Game ids:** raw ESPN ids are kept, with a collision guard.
- **Recordings:** a `sport` field on each record, in the same files.
- **Classic detector:** stays CFB-only.
- **Hot moments:** the red outline generalizes to "hot moment" in every sport.
- **Tier-2 label:** "Other screen's sport (NHL)". Tier 3 is "Other sport (NBA)".
- **NBA games without an ESPN broadcast listing** are greyed "No TV listing".
- **Soccer leagues** if time allows: MLS, EPL, UCL, La Liga. I'll confirm the list before building it.
- **Expected change on mixed days:** on a mixed Saturday, a CFB screen whose break has no CFB substitute now fills from another sport. That is the new rule, not a regression; CFB-only behavior is what's frozen.
- **Midnight rollover:** the date key still doesn't roll over at midnight (existing behavior). Late West Coast NBA/NHL games stay on the starting day's slate.

## As built (10/18): where the build departed from the plan

- **Live situation:** football keeps `GameSnapshot.situation` exactly as it was; other sports use a separate `live` field (a family-tagged union) instead of turning `situation` into a union. Same information, no churn in college football's code and tests.
- **Markets** are a TS table (`src/sports/markets.ts`) rather than `config/markets.json`: the engine stays free of file reads.
- **NFL:** the data showed the NFL takes its commercial after the score (91% ≥ 90 s) and the kickoff after it is quick (10%), so for the NFL the kickoff ends the break (college football keeps TD → PAT → kickoff as one break). The two-minute warning got its own category.
- **Model building (all sports but CFB):** a gap that another stoppage (a timeout, review…) interrupts is counted under that stoppage, not the play before it. Live, that stoppage replaces the play as the last one, so the old counting made "long quiet after a foul" look like a TV break (WCBB false switches 16% → 6%). College football's shipped model is unchanged.
- **`BreakSpec.ignore`:** bookkeeping plays (basketball substitutions, MLB new batters / at-bat summaries) don't change which stoppage a game is in.
- **`liveFromPlays`:** the NHL power play comes from the latest play's strength (the scoreboard doesn't carry it).
- **Sim flags added:** `--by-sport`, `--screen-sports`, `--full-lineup` (every game watchable, for judging a detector), `--no-regional`; config `sports.nflRegionalCheck`, `simulation.fullLineup`.
- **NFL guide titles:** the engine accepts program titles (`Engine.setProgramTitles`), but no adapter reads them yet (needs a live Sunday check). Until then only the market team is confirmed in a multi-game CBS/FOX window.
- **Not built:** lead changes as an excitement signal (needs score history per game); soccer (waiting on the league list).
