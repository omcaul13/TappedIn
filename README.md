# RedZone Director

A personal "RedZone" for college football. One app window shows four Xfinity Stream (Xfinity On Campus) channels in a 2×2 grid. A director watches ESPN's live game data and changes each screen's channel:

- **Long commercial break on a screen's game:** the screen fills in with the best live game, red-zone games first.
- **Play resumes:** the screen goes back to its game.
- **Halftime:** the screen plays a highlights reel.
- **Game ends:** a game picker appears in that screen.

Personal use only. The app plays Xfinity in castLabs' Widevine-licensed Electron and clicks channels in Xfinity's guide the way you would. It never extracts or redistributes streams, never touches DRM, and never types your credentials.

| Phase | What | Status |
|---|---|---|
| 0–4 | Chrome tiles: data service, director, window control, control panel, halftime reel | ✅ done (live-tested 10/17) |
| v2.1 | **One app window** (Electron) with per-screen overlays, settings drawer, team colors and logos | ✅ done (live-tested 10/17) |
| v2.2 | **Faster switching:** standby views, in-window switching card, faster play-by-play for on-screen games | ✅ done (live-tested 10/17) |
| v2.3 | **Switch less:** break forecast from 76 recorded games, Low/Medium/High sensitivity, hysteresis | ✅ done (replayed 10/10 and 10/17) |
| v3.0 | **Other TV services:** provider adapters with per-service config files (Stage 2 of [the plan](docs/superpowers/plans/2026-10-18-provider-adapters.md)) | 🚧 in progress: Xfinity live re-check pending |

## TV services

Each service is an adapter driven by its own file in `config/providers/`. Every URL, page selector, timing and error message is in that file, so a site change can be fixed without touching code. Put your own fixes in `.state/providers/<id>.json`; they're merged over the shipped file, and a bad value is ignored with a warning. The research behind this list is in [docs/research/streaming-services.md](docs/research/streaming-services.md).

| Service | `provider` id | Status | Changes channels by | Documented streams |
|---|---|---|---|---|
| Xfinity On Campus | `xfinity-on-campus` | **Stable** (the default) | guide clicks, remembered URLs | 1 (6 worked at Northeastern, 10/17) |
| Xfinity Stream (Xfinity TV customers) | `xfinity-stream` | Experimental | same as On Campus | 5 at home, 3 away |
| Spectrum TV / SpectrumU | `spectrum-tv` / `spectrumu` | Experimental | a URL per channel | unlimited at home, 3 away / several on campus |
| Cox Contour / Cox Contour on Campus | `cox-contour` / `cox-contour-campus` | Experimental | guide clicks | — / 1 |
| YouTube TV | `youtube-tv` | Experimental (sign-in not yet tested) | a URL per channel | 3 |
| Sling TV | `sling` | Experimental | a URL per channel | Orange 1, Blue 3, both 4 |

**Experimental** means it's built from the service's documentation and from open-source projects that drive the same web players, but nobody has tested it with a real account yet. To try one, put `provider: "spectrum-tv"` at the top of `config/redzone.config.json5` (or `"provider"` in `.state/settings.json`) and check it without the engine first:

```bash
npm run provider-check -- spectrum-tv --scan --save --tune ESPN,FS1
```

This signs in (you type your own password in the service's real page), reads the guide, saves the college-football networks it found to `.state/lineups/<id>.json`, and tunes two channels. It reports how each one went, with a screenshot when something doesn't play. The first-run setup, a settings page and a step-by-step diagnostics mode are next (Stage 3).

RedZone isn't affiliated with or endorsed by any of these services. Each one's terms of service apply to your account. Standby views (extra streams) are off by default on every service; set `"standbyViews"` in `.state/settings.json` if yours allows more streams.

## Setup

Requirements: Windows, Node 22+ (tested on 24), Python 3.12 (only to sign Electron, once), and an Xfinity On Campus account. Live TV generally only works on the campus network.

```bash
npm install
```

```bash
npm test
```

### Sign the Electron app for Widevine (once, and after every Electron update)

The app uses castLabs' Electron build ("ECS"), which includes Google's Widevine. Out of the box it is signed for development only, and Xfinity's license server refuses it (`Failed to acquire a license -9000:502`). castLabs' free EVS service signs it for streaming:

1. `pip install castlabs-evs`, then create a free account: `python -m castlabs_evs.account signup` (you type your details; it emails a code).
2. Sign: `npm run sign-electron` (uploads the Electron binary to castLabs and writes `electron.exe.sig`; the signature lasts about 3.7 years).

**Norton or other antivirus "web shield":** if Python reports `CERTIFICATE_VERIFY_FAILED`, the antivirus is re-signing HTTPS. Point Python at a certificate bundle that includes its root, for example `$env:AWS_CA_BUNDLE` and `$env:REQUESTS_CA_BUNDLE` set to `%LOCALAPPDATA%\RedZone\ca-bundle.pem` (Python's `certifi` bundle plus the antivirus root exported from Windows' certificate store).

### Signing in to Xfinity

The first time, run `npm start`. If Xfinity On Campus needs you, a "RedZone: sign in" window opens: sign in with your school account, accept Xfinity's **Terms of Activation** if asked (your call; the app never clicks it), and click **Watch Now**.

After that, the app signs itself in at every start:
1. It checks whether Xfinity Stream is still signed in.
2. If not, it opens your Xfinity On Campus page in a hidden window and clicks **Watch Now**, exactly what you'd click. Your Xfinity On Campus sign-in persists in `%LOCALAPPDATA%\RedZone\electron`; Xfinity Stream's own session doesn't survive a restart.

Xfinity rejects Electron's browser identifier ("update your browser"), so the app presents the matching Chrome identifier.

## Running it

```bash
npm start
```

One RedZone window opens maximized: a slim top bar and four screens edge to edge. **F11** toggles full screen. It picks four watchable home games to start; change them from each screen's game list. Close the window (or Ctrl+C in the terminal) to stop.

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
| `npm run sim -- --day 20261017 [--from 19:30 --to 22:00] [--compare] [--sensitivity low\|medium\|high] [--model classic]` | Replays a recorded day through the real engine. `--compare` prints before/after switching metrics |
| `npm run fetch-day -- 20261010` then `npm run sim -- --day 20261010 --synth` | Rebuilds **any past Saturday** from final play-by-play and simulates it |
| `npm run build-break-model` | Rebuilds the break forecast from every recorded game |
| `npm run switch-stats -- [--since 22:52]` | Switch timing per stage and path |
| `npm run analyze-log` | Detector vs your labels, switching stats |
| `npm run record` | Records a game day's ESPN data to `recordings/<date>/` (about 30 MB/hour) |
| `npm run espn:probe` | Today's slate, networks, and whether you can watch each game |
| `npm run sign-electron` | castLabs EVS signing (see Setup) |
| `npx electron electron/spike.cjs --views 4 --overlay --hide-ui --ua-chrome` + `npx tsx scripts/spike-electron.ts ESPN ESPN2 ABC FOX` | The Electron feasibility spike |
| `npx tsx scripts/shell-check.ts` | Starts the app window alone and prints everything it says |

The old control panel still works at <http://localhost:7480/panel>.

## Project layout

```text
config/redzone.config.json5   the one editable file
config/break-model.json       stoppage-length model (npm run build-break-model)
electron/main.cjs             app window: frameless window, Xfinity views + standby views, UI layer, Watch Now sign-in
electron/ui-preload.cjs       the UI's only shell access: full screen
electron/spike.cjs            Option A feasibility spike
src/app.ts                    the app: ESPN data -> engine -> window controller, UI state + API, settings, labels
src/shell.ts                  starts the app window and finds its views over the local debugging port
src/ui/                       the window's UI (Preact, bundled on the fly by esbuild): top bar, screen overlays,
                              game list, switching card, game-over panel, settings drawer
src/engine/                   gameStore, forecast + forecastDetector (switch less), breakDetector (classic),
                              ranker, director, audio, engine, invariants
src/espn/                     client, normalize (incl. team colors/logos), source (two-tier live poller + replay),
                              recording, synth
src/highlights/               halftime reel sources
src/windows/                  tune (guide, in-app, cached URLs, one load at a time), health, screen (one view),
                              controller (commands, standby views, retries, drift, stream limits), chrome (Chrome shell)
src/server/                   localhost: UI page + live state (server-sent events), data tile, halftime reel, old panel
src/sim.ts, src/simMetrics.ts replay + before/after metrics
scripts/                      the npm run commands above
test/                         vitest: forecast, break detector, director (incl. switch-less rules), ranker, replay guards…
.state/                       remembered channel URLs, settings changed in the app, YouTube cache (safe to delete)
```

## Findings worth knowing (10/17/2026)

- **Electron (castLabs ECS 44.5.1, signed with EVS):** Xfinity plays with the Chrome identifier. Four channels in one window played at 960×540, 60 fps, with CPU at about 26%. Six simultaneous streams played with no limit message.
- **Overlays:** a transparent view draws cleanly over the protected video. Hiding Xfinity's interface while the player is up leaves just the picture.
- **Xfinity pages loading at the same moment** in one browser session can all end up on the same channel, so loads go one at a time.
- **Stream delay:** the picture runs about 30 s behind real time and ESPN data about 25 s. A snap ESPN logged at 18:56:19 appeared on screen at about 18:56:49.
