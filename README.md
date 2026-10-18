# RedZone Director

A "RedZone" for college football, on the TV service you already have. One app window shows up to four channels in a grid. A director watches ESPN's live game data and changes each screen's channel:

- **Long commercial break on a screen's game:** the screen fills in with the best live game, red-zone games first.
- **Play resumes:** the screen goes back to its game.
- **Halftime:** the screen plays a highlights reel.
- **Game ends:** a game picker appears in that screen.

RedZone plays your service's own web player in castLabs' Widevine-licensed Electron and changes channels the way you would: by its channel addresses or by clicking its guide.
- It never extracts or redistributes streams and never touches DRM.
- You sign in on the service's real page. RedZone never sees, stores or sends your password.
- Everything runs on your computer. Nothing is sent anywhere except to your TV service and ESPN's public scores.

RedZone isn't affiliated with or endorsed by any TV service, school, league or network, and each service's terms of use apply to your account.

| Phase | What | Status |
|---|---|---|
| 0–4 | Chrome tiles: data service, director, window control, control panel, halftime reel | ✅ done (live-tested 10/17) |
| v2.1 | **One app window** (Electron) with per-screen overlays, settings drawer, team colors and logos | ✅ done (live-tested 10/17) |
| v2.2 | **Faster switching:** standby views, in-window switching card, faster play-by-play for on-screen games | ✅ done (live-tested 10/17) |
| v2.3 | **Switch less:** break forecast from 76 recorded games, Low/Medium/High sensitivity, hysteresis | ✅ done (replayed 10/10 and 10/17) |
| v3.0 | **Other TV services:** provider adapters with per-service config files | ✅ Xfinity re-verified live 10/18 through the adapter; full app check on a game day pending |
| v3.1 | **Setup for everyone:** one-click installer, first-run setup, TV service settings, diagnostics | 🚧 built; live run-through pending |

## Supported TV services

| Service | Status | Changes channels by | Documented streams |
|---|---|---|---|
| Xfinity On Campus | **Tested** | guide clicks, remembered addresses | 1 (6 worked at Northeastern, 10/17) |
| Xfinity Stream (Xfinity TV customers) | Experimental | same as On Campus | 5 at home, 3 away |
| SpectrumU / Spectrum TV | Experimental | an address per channel | several on campus / unlimited at home, 3 away |
| Cox Contour on Campus / Cox Contour | Experimental | guide clicks | 1 / — |
| YouTube TV | Experimental (sign-in not yet tested) | an address per channel | 3 |
| Sling TV | Experimental | an address per channel | Orange 1, Blue 3, both 4 |

- **Tested:** used with a real account.
- **Experimental:** built from the service's documentation and from open-source projects that drive the same web players, but nobody has tested it with a real account yet. If it doesn't work for you, the app's **Diagnostics** can usually fix it, and you can send the fix back: see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Not supported yet:**
  - Apogee Stream2 (USC, George Mason, Rochester, Wake Forest and others), Hulu + Live TV, Fubo, DIRECTV.
  - Philo, which carries no sports networks.
- The research behind this list is in [docs/research/streaming-services.md](docs/research/streaming-services.md).

## Install (Windows)

1. Download this project (green **Code** button → **Download ZIP**, then unzip it, or `git clone` it).
2. Double-click **`Setup RedZone.cmd`**. It:
   - checks for Node.js and Python, and offers to install them (only if you type **Y**);
   - installs RedZone's parts;
   - walks you through castLabs' free EVS sign-up (castLabs' own prompts: RedZone never sees what you type);
   - signs the video player, then checks everything;
   - adds a **RedZone** shortcut to the Start menu and desktop, and opens the app.
3. The first start opens **setup**: pick your service, sign in, and RedZone checks your channels and how many streams your plan plays at once (about two minutes).

Run **`Update RedZone.cmd`** to update; it re-signs the player only when it changed. `npm run doctor` checks an install and says how to fix anything wrong.

<details>
<summary>Doing it by hand (developers)</summary>

Requirements: Windows, Node 22+ (tested on 24), Python 3.12 (only to sign Electron).

```bash
npm install
```

```bash
npm test
```

**Sign the Electron app for Widevine** (once, and after every Electron update). The app uses castLabs' Electron build ("ECS"), which includes Google's Widevine. Out of the box it is signed for development only, and services' license servers refuse it (Xfinity: `Failed to acquire a license -9000:502`). castLabs' free EVS service signs it for streaming:
1. `pip install castlabs-evs`, then create a free account: `python -m castlabs_evs.account signup` (you type your details; it emails a code).
2. Sign: `npm run sign-electron`. It uploads the Electron binary to castLabs and writes `electron.exe.sig`; the signature lasts about 3.7 years.

**Norton or another antivirus "web shield":** if Python reports `CERTIFICATE_VERIFY_FAILED`, the antivirus is re-signing HTTPS. The setup file handles this by having Python trust Windows' certificate store (the `truststore` package). By hand, point Python at a certificate bundle that includes the antivirus root: set `$env:AWS_CA_BUNDLE` and `$env:REQUESTS_CA_BUNDLE` to `%LOCALAPPDATA%\RedZone\ca-bundle.pem`, which is Python's `certifi` bundle plus the antivirus root exported from Windows' certificate store.

</details>

## First-run setup

`npm start` (or the RedZone shortcut) opens setup the first time, and again whenever you switch services:

1. **Welcome**, then **pick your service.**
   - Campus TV comes with your housing.
   - The search box also finds your school ("Northeastern" → Xfinity On Campus).
2. **Sign in** on the service's own page, in a window RedZone opens.
   - School sign-in (SSO, Duo) works there as usual.
   - Accepting a service's terms (such as Xfinity's Terms of Activation) is your call; RedZone never clicks them.
   - Only the browser's normal session cookies are kept, on this computer, separately for each service.
3. **Channels.** RedZone reads the service's guide and shows which college-football networks you get. Games on networks you don't get are greyed out and never picked.
4. **Playback.** One channel plays on screen 1.
5. **Streams.**
   - RedZone adds screens one at a time until one won't play.
   - Then it sizes the grid (1, 2, 3 or 4 screens) and explains any limit, e.g. "Your plan played 2 streams at once (Xfinity documents 1). RedZone will use 2 screens."

Xfinity On Campus signs itself in at every later start. Its On Campus sign-in persists, and RedZone presses the **Watch Now** button on your On Campus page in a hidden window, exactly what you'd click. Xfinity rejects Electron's browser identifier ("update your browser"), so the app presents the matching Chrome identifier.

## Settings → TV service

- **The service:** its status, how many streams played in the last test, and the screen count.
- **Re-scan channels**, **Re-test streams**, **Log out** (clears only that service's sign-in), and **Diagnostics**.
- **Standby views** (0–2): extra hidden streams that make switching instant. They're off by default because each one counts against your plan's stream limit.
- **Channels:** point each network at a different guide channel, or mark it "Not in my lineup".
- **Another service:** runs setup for it. Each service keeps its own sign-in.

## Diagnostics

For a service that doesn't work right (most likely an experimental one), from setup ("Having trouble?") or Settings → TV service.

**The steps.** Diagnostics runs each part on its own, with screen 1 left visible, and shows pass or fail and what it saw:
- sign-in detection
- channel guide
- tuning
- playback
- full-screen video

**Fixing a step.** When a step fails, the settings it depends on (page addresses, selectors, patterns) appear right there. Change them and press **Save & retry**. Fixes are checked before saving and kept in `.state/providers/<id>.json`, on top of the built-in `config/providers/<id>.json`.

**Sharing the fix.** **Export config** writes your fixes and the results to `Documents\RedZone`. The file has no passwords, cookies or page text, and addresses are cut to the site and page. Send it in so everyone gets the fix ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Running it

```bash
npm start
```

One RedZone window opens maximized: a slim top bar and your screens (four, or what setup found your plan plays) edge to edge. **F11** toggles full screen. It picks four watchable home games to start; change them from each screen's game list. Close the window (or Ctrl+C in the terminal) to stop.

| Mode | Command | What you see |
|---|---|---|
| Live | `npm start` | Xfinity video in each screen, switched by the director |
| Dry run | `npm start -- --dry-run` | Today's real ESPN data, but **live data tiles** instead of video (uses no streams) |
| Replay | `npm start -- --replay 20261017 --from 19:30 --speed 10` | A recorded night, sped up, on data tiles. Add `--synth` for a day fetched with `fetch-day` |
| Chrome tiles | `npm run start:chrome` | The original four Chrome windows + control panel (fallback) |

Other options: `--homes id1,id2,id3,id4`, `--no-auto` (start with no home games), `--audio auto`, `--no-record` (by default live mode also records ESPN data to `recordings/<date>-live/`).

### The window

**Top bar:** live game count, the clock, **switch sensitivity** (Low / Med / High), **sound** (Manual / Auto), settings, full screen, and the window buttons. A chip appears while signing in to Xfinity.

**Each screen** has an overlay that appears when you move the mouse over it and hides after 3 seconds without movement (it also flashes for a few seconds when the screen changes):
- **Game list** (click the game at top left): today's games with logos, score or kickoff, and network. Games you can't watch (not in your lineup, ESPN+, Peacock…) are greyed out. Search by team or network. Picking a game makes it this screen's game.
- **State badge:** `LIVE`, `BREAK`, `HALFTIME`, `FINAL`, `SHOWING OTHER GAME`, `STARTS 8:00 PM`, or `STREAM PROBLEM`.
- While on another game: a line saying why (for example `Showing UTAH 7–0 COLO · ND @ BYU: timeout · ~1:49 left (78%)`) and **Back to my game**.
- **Lock:** no automatic switching on this screen.
- **Sound:** sound from this screen only (the others mute). Click again to mute everything.
- A red pulsing outline when the screen shows a game in the red zone.

When the overlay hides, a small tag stays only if something is worth knowing (`→ UTAH @ COLO`, `Locked`, halftime, the sound icon).

**Inside a screen:**
- **"Switching to…" card** with both teams' logos and colors, while a new channel loads in place. When the new game loads in a standby view instead (see below), the picture stays up and a small "Getting UTAH @ COLO ready…" note shows.
- **Game over:** the picker (live games and later games, with logos) and a countdown to the auto-pick; **Not now** cancels it.
- **Halftime:** the highlights reel (ESPN clips, optional YouTube packages, scores board).
- **Live data tile** when a stream limit or a dry run means no video.

**Settings drawer** (gear, or **S**): switch sensitivity, sound mode, dwell time, minimum time on a substitute, ESPN polling for on-screen games and for likely substitutes, duplicates, YouTube status, recent switches, and keys. Changes apply at once and are saved in `.state/settings.json`, which wins over the config file until **Reset to the config file**.

**Keys:** **1–4** sound from that screen · **M** mute all · **L** lock/unlock the screen under the mouse · **H** that screen back to its game · **S** settings · **F11** full screen · **Esc** close menus.

## Switch sensitivity: only long breaks

There's no "commercial" flag in any data feed, so the app forecasts how long the stoppage after the latest play will last, from **real stoppages in 76 recorded games** (10/10 and 10/17/2026, `config/break-model.json`, rebuilt by `npm run build-break-model`).

**What the data says:** gap from a play to the next live-ball play.

| After… | Median gap | Gap ≥ 90 s |
|---|---|---|
| End of Q1 or Q3 | 234 s | 99% |
| Injury | 132 s | 81% |
| Kickoff after a score | 125 s | 70% |
| Team timeout | 90 s | 50% |
| Change of possession | 71 s | 46% |
| Review | 62 s | 48% |
| Incompletion, out of bounds, penalty, ordinary play | ~40 s | 6–9% |

How long the quiet has already lasted matters as much as the play type. TV timeouts never appear in play-by-play, but an ordinary play followed by 2 minutes of quiet is usually one.

**The rule:** switch when P(at least `minBreakSeconds` of break left *for you*) ≥ `confidence`.
- "For you": the Xfinity picture runs ~30 s behind real time and ESPN data ~25 s, so the app only acts once you've seen the play, and measures the quiet up to ESPN's last poll for that game.
- Halftime and game over are handled separately.

| Sensitivity | Min. break / confidence | What it switches for |
|---|---|---|
| **Low** (default) | 60 s / 75% | Right away: ends of quarters, injuries, kickoffs after scores. Team timeouts and possession changes once 60–75 s of quiet shows a TV break. Ordinary plays only after ~2 min of quiet. **Never** incompletions, out-of-bounds, penalties or first downs on their own. |
| Medium | 60 s / 70% | Also likely breaks, a little sooner |
| High | 45 s / 65% | Most stoppages, including team timeouts right away; also jumps to red-zone games during a break |

**Hysteresis:**
- A screen goes back to its game only when that game shows a **new play** (play-by-play or a new scoreboard last play), never on clock movement.
- It stays at least `minSubstituteSeconds` (30) on a substitute.
- The TD → PAT → kickoff sequence counts as one break.
- A 10-minute data safety net catches ESPN going quiet.

**Churn rules:**
- A substitute that goes to its own break is swapped for a third game only if your game still has `replaceIfHomeRemainingSeconds` predicted (Low 120 s, Medium 90 s, High 60 s). Otherwise the screen waits on the substitute until your game resumes.
- Substitutes that are probably in a stoppage themselves are skipped.

The original weighted-signal detector is still there as `switching.breakModel: "classic"`, used for the before/after comparison.

### Before and after: replays of real game days, same four games on screen

`npm run sim -- --day 20261010 --synth --from 15:30 --compare` (whole Saturday, 15:30–02:36, 44 screen-hours):

| | Before (classic) | **Low** | Medium | High |
|---|---|---|---|---|
| Automatic switches | 1,084 | **690 (−36%)** | 898 (−17%) | 1,313 |
| Switches per screen-hour | 24.4 | **15.5** | 20.2 | 29.5 |
| Fills where your game resumed within 45 s | 21% | **14%** | 18% | 16% |
| Real long breaks (≥ 90 s) caught | 87% | **80%** | 89% | 91% |
| Commercial time skipped | 606 min | **606 min** | 702 min | 805 min |
| Your game's action missed | 117 min | **83 min** | 118 min | 146 min |

`npm run sim -- --day 20261017 --to 21:30 --compare` (tonight's live recording, games still in progress): before 328 switches, **Low 205 (−37%)**.

Tonight live (one window, Low, 22:52–23:20), each of the 21 automatic switches was for one of these:
- an end of quarter;
- a kickoff after a score;
- a score followed by 2+ minutes of quiet;
- a timeout after 70+ s of quiet;
- a change of possession after 60+ s of quiet.

None was for an incompletion, an out-of-bounds play or a penalty.

## Faster switching

Every switch is timed: decision → command → navigation → first frame → playing, logged to `logs/decisions-*.jsonl`. `npm run switch-stats -- [--since HH:MM]` prints the averages per path.

**How the app changes a channel,** fastest first:
1. **Standby swap (0 s):** while a screen shows a substitute, its own game keeps playing, muted and hidden, in a standby view under it. Going back is a swap.
2. **Standby load (~4.5 s, no black screen):** a substitute loads in a free standby view (kept on Xfinity's guide) while the screen keeps showing its game, and cuts over once the new video plays.
3. **In-app (~4.2 s):** press the player's *Close Player* button, find the channel in the guide (binary search over its scroll position), click it. A "Switching to…" card covers the load.
4. **A remembered URL (~10–12 s):** each channel's live URL, cached in `.state/xfinity-urls.json` and checked against the channel's call sign.
5. **Full guide load (~12–15 s).**

**Also:**
- At halftime the reel plays in a standby view and the game keeps playing underneath, so the 2nd half starts with a swap.
- Play-by-play for the games on screen now comes every 6 s instead of every ~20 s, so restarts are seen sooner.

**Measured tonight (10/17):**

| | Before: Chrome tiles (n = 78) | After: one window |
|---|---|---|
| Typical switch, decision → video playing | in-app 5.4 s (p90 6.2 s) | in-app **4.2 s** (p90 4.5 s, n = 21) |
| Going back to your game | 5.4 s | **0.0 s** with a parked stream (standby swap) |
| Leaving for a substitute | 5.4 s of loading | **4.5 s** in a standby view, picture stays up (n = 5) |
| Remembered-URL page load | 11.8 s | 10–12 s (startup loads go one at a time) |

The two standby views mean up to 6 streams at once. 6 played fine on 10/17. If Xfinity ever reports a stream limit, standby turns itself off. Set `electron.standbyViews: 0` to turn it off.

**Where the time goes in a switch:** about 2 s for Xfinity's page and guide to reach the channel, about 2 s to the first video frame, and 0.3 s to playback. The director decides and commands within 0.1 s.

## The config file

Everything you might tune lives in **`config/redzone.config.json5`**: the lineup, switching sensitivity and presets, polling rates, dwell time, standby views and audio. Every value is commented. Anything you leave out falls back to the default in `src/config.ts`. Most sections hot-reload.

### Channels

Xfinity's live URLs contain an ID for the current program (`/stream/live/<title>/<programId>/<CALLSIGN>`), so the config stores each network's **channel number** (to click in the guide) and **call sign** (to check the page landed on the right channel).

```json5
"ESPN": { number: 849, callSign: "ESPND", aliases: ["ESPN"] },
"Big Ten Network": { number: null, aliases: ["BTN"] },   // not in this lineup
```

- `aliases` are the exact network names ESPN uses.
- `number: null` marks a network you don't get. Its games are greyed out and never picked.
- The shipped numbers are the HD channels in the Northeastern (Boston) lineup, read from the guide on 10/17/2026.

## When something goes wrong

Every screen is checked every 2 s: is the video advancing, is it on the right channel, did a playback or DRM error occur, did Xfinity sign out, is there error text such as "maximum number of devices"?

- **Stalled or unknown error:** one retry. Then a red card in the screen, the director stops auto-switching it, and it retries every `errorRetrySeconds`.
- **Wrong channel:** Xfinity pages that start loading at the same moment can end up on each other's channel. Loads go one at a time, and a screen that drifts is tuned back.
- **Signed out:** the app runs the Watch Now sign-in again, then re-tunes every screen.
- **Stream limit:** standby views turn off first, then the least exciting screens show live data tiles.
- **Some screens black but playing:** on some laptops Windows' DirectComposition video path doesn't draw every view. `electron.disableDirectComposition: true` (default) fixes it.

## Commands

| Command | What it does |
|---|---|
| `npm start` / `npm run start:chrome` | The app (one window / Chrome tiles) |
| `npm start -- --setup` | Run first-run setup again |
| `npm start -- --setup-demo` | Click through setup with nothing real behind it (no window, no streams): open <http://localhost:7480/ui> |
| `npm run provider-check -- <service> [--scan [--save]] [--tune ESPN,FS1] [--views N]` | Try one service's adapter without the engine: sign in, read the guide, tune channels (screenshots when something doesn't play) |
| `npm run doctor` | Checks the install and says how to fix what's wrong |
| `npm run sim -- --day 20261017 [--from 19:30 --to 22:00] [--compare] [--sensitivity low\|medium\|high] [--model classic]` | Replays a recorded day through the real engine. `--compare` prints before/after switching metrics |
| `npm run fetch-day -- 20261010` then `npm run sim -- --day 20261010 --synth` | Rebuilds **any past Saturday** from final play-by-play and simulates it |
| `npm run build-break-model` | Rebuilds the break forecast from every recorded game |
| `npm run switch-stats -- [--since 22:52]` | Switch timing per stage and path |
| `npm run analyze-log` | Detector vs your labels, switching stats |
| `npm run record` | Records a game day's ESPN data to `recordings/<date>/` (about 30 MB/hour) |
| `npm run espn:probe` | Today's slate, networks, and whether you can watch each game |
| `npm run sign-electron` | castLabs EVS signing (see Install) |
| `npx electron electron/spike.cjs --views 4 --overlay --hide-ui --ua-chrome` + `npx tsx scripts/spike-electron.ts ESPN ESPN2 ABC FOX` | The Electron feasibility spike |
| `npx tsx scripts/shell-check.ts` | Starts the app window alone and prints everything it says |

The old control panel still works at <http://localhost:7480/panel>.

## Project layout

```text
config/redzone.config.json5   the one editable file
config/providers/<id>.json    one per TV service: URLs, selectors, timings, error text, sign-in rules
config/schools.json           school → campus TV service, for setup's search
config/break-model.json       stoppage-length model (npm run build-break-model)
electron/main.cjs             app window: frameless window, video views + standby views, UI layer, sign-in;
                              configure/logout/sign-in check requests from the app
electron/layout.cjs           where each screen sits for 1-4 screens (the UI mirrors it)
electron/ui-preload.cjs       the UI's only shell access: full screen
electron/spike.cjs            Option A feasibility spike
src/app.ts                    the app: ESPN data -> engine -> window controller, UI state + API, settings, labels
src/shell.ts                  starts the app window and finds its views over the local debugging port
src/ui/                       the window's UI (Preact, bundled on the fly by esbuild): top bar, screen overlays,
                              game list, switching card, game-over panel, settings drawer, setup, diagnostics
src/providers/                TV service adapters (comcast: guide clicks; url: an address per channel), registry,
                              lineup and network matching
src/setup/                    first-run setup steps, setup state, diagnostics, export, channel mapping
src/engine/                   gameStore, forecast + forecastDetector (switch less), breakDetector (classic),
                              ranker, director, audio, engine, invariants
src/espn/                     client, normalize (incl. team colors/logos), source (two-tier live poller + replay),
                              recording, synth
src/highlights/               halftime reel sources
src/windows/                  tuner (parallel tunes, one page load at a time, remembered URLs), health, screen (one view),
                              controller (commands, standby views, retries, drift, stream limits), chrome (Chrome shell)
src/server/                   localhost: UI page + live state (server-sent events), data tile, halftime reel, old panel
src/sim.ts, src/simMetrics.ts replay + before/after metrics
scripts/                      the npm run commands above
test/                         vitest: forecast, break detector, director (incl. switch-less rules), ranker, replay guards…
.state/                       setup state, scanned lineups, your adapter fixes (providers/), remembered channel URLs,
                              settings changed in the app, YouTube cache
```

## Findings worth knowing (10/17/2026)

- **Electron (castLabs ECS 44.5.1, signed with EVS):** Xfinity plays with the Chrome identifier. Four channels in one window played at 960×540, 60 fps, with CPU at about 26%. Six simultaneous streams played with no limit message.
- **Overlays:** a transparent view draws cleanly over the protected video. Hiding Xfinity's interface while the player is up leaves just the picture.
- **Xfinity pages loading at the same moment** in one browser session can all end up on the same channel, so loads go one at a time.
- **Stream delay:** the picture runs about 30 s behind real time and ESPN data about 25 s. A snap ESPN logged at 18:56:19 appeared on screen at about 18:56:49.
