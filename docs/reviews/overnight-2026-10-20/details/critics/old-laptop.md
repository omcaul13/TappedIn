# TappedIn feedback: old-laptop persona

Me: an older laptop (4 cores, 8 GB RAM, integrated graphics, 1366x768 screen, usually on battery).
Tested on origin/main 639531f, Windows 11: onboarding with `--setup-demo` (headless Chrome at 1366x768), then
`--replay 20261017 --from 19:30 --speed 20` for about 1.5 h of real time (24 min sampled every 30 s, plus spot checks), then
2-minute runs with 4, 3, 2 and 1 screens. Replay shows data tiles, not video, so **every number below leaves out video
decoding**, which is the biggest cost with real streams. The test machine is a fast 16-thread PC at 125% scaling. I give CPU as
"cores busy" so you can scale it to a 4-core laptop. I counted only my own processes (the process tree of my app).

## Numbers

| What | Measured | What it means on my laptop |
|---|---|---|
| Startup to the UI showing text (Electron window, top bar) | 2.3–3.0 s (5 starts) | fine |
| Startup to data on the screens, replay, no saved sign-in | **10 min 25 s** (01:34:20 → 01:44:45) | replay looks frozen for 10 minutes |
| Same, with the sign-in wait set to 3 s in `.state/providers` | 26–27 s (4 starts, any screen count) | about 25 s of every start goes to an Xfinity sign-in that replay doesn't need |
| CPU, 4 data tiles, steady (24-min run) | avg 3.1% of 16 threads ≈ **0.5 core** | ≈ 12–15% of a 4-core laptop before any video |
| CPU by screen count (2-min runs) 4 / 3 / 2 / 1 | 0.82 / 0.61 / 0.51 / 0.35 cores | GPU process: 0.37 / 0.29 / 0.23 / 0.12 cores |
| Memory (private), start of the 24-min run → end | 2.54 GB → 3.27 GB | +30 MB/min |
| Of that: Node (app server, replay) | 1.80 GB, flat | about 1.8 GB just to replay a day |
| Of that: Electron renderers (UI + tiles) | 268 MB → 1,057 MB in 24 min; about 1.75 GB after 1.5 h (each tile renderer ≈ 295 MB) | **it keeps growing**: an 8 GB laptop starts swapping during a long Saturday |
| JS heap of each tile page after 1.5 h | 6–7.5 MB | the growth isn't in JS objects (native: images, DOM churn or caches?) |
| `/api/state` size | 62–68 KB; each data tile fetches it **every second** | 4 tiles ≈ 260 KB/s of JSON to build and parse, all day |
| UI page main thread busy: grid + mini ticker | 9% of a core | |
| … big ticker on | **30–33% of a core** | about 3x; same with the ticker paused (Space) |
| … window minimized (big ticker on) | 8% of a core; tiles still re-layout every second | keeps working while nobody is looking |
| Click to paint, normal CPU (median / max, n=4) | settings 23/31 ms, game list 30/32, big ticker on 233/499, fullscreen 118/246, back to grid 149/226 | fine |
| Same with 4x CPU throttle on the UI page (my laptop) | settings 107/116 ms, game list 122/370, **big ticker on 1,245/3,005**, fullscreen 180/657 | the ticker toggle feels broken |

## What's good
- The UI is quick on its own: settings and the game list open in about 25 ms, and in about 110 ms even at 4x CPU throttle.
- At 1366x768 the 4-tile grid fits, with no page scroll, and the scores are big and readable (02-grid-1366x768.png).
- Onboarding is clear and short, works at 1366x768, and the "How many screens?" step explains the stream limit well.
- The 1-screen layout uses the whole window well.

## What's confusing
- **Replay mode says "Xfinity sign-in failed" in red, all the time** (medium, 02-grid-1366x768.png). Replay and dry run don't use
  the service, but the top bar (and the big ticker's label, cut off as "SIGN-IN FAILE") shows a red error for the whole session.
  As a new user I'd think something is broken. Hide the sign-in chip in replay and dry run, or don't sign in at all (see Bugs).
- **The screen-count choice is about streams only, never about my computer** (medium, 01-setup-how-many-screens-1366.png). Setup
  picks "3 screens" because the plan allowed 3. Nothing says that each screen costs CPU, memory and battery, or suggests 1–2
  screens on a weak or unplugged laptop.
- **"4 live" while every game is frozen** (low, 05-after-day-end-duplicate-and-endless-reel.png). After the recorded data ran
  out, all screens showed UNKNOWN with clocks stuck at 1:33 2nd, but the chip still said "4 live".

## Slow or clunky
- **The big ticker costs 3x the UI's CPU and makes its own toggle slow** (high for my persona). With the big ticker on, the UI
  page's main thread was busy 30–33% of a core (9% without it). Pressing Space (which the README says pauses it) didn't change that. I didn't check visually that it had paused. At 4x CPU throttle,
  turning it on took up to 3 s to appear. On battery that's a real cost for a strip of scores. Suggest: no requestAnimationFrame
  loop when paused, hidden or minimized; a CSS transform animation (compositor-only) or a slower step-scroll; or an "economy"
  mode that only steps.
- **Each data tile polls the full app state every second** (medium). `tile/N`, picker and some other in-screen pages
  `fetch('/api/state')` (≈ 65 KB) once a second, so 4 tiles is about 260 KB/s of JSON serialize/parse forever, even while the
  window is minimized or a screen is hidden behind a fullscreen one. The UI already has server-sent events, and the tiles could
  use them, or a per-screen slice.
- **Hidden things keep working** (medium). Minimized: the UI page stays 8% of a core busy and every tile still re-renders each
  second. Per-screen fullscreen: the 3 hidden tiles still re-render each second (README says they keep tracking, which is fine,
  but they don't need to paint). The halftime reel kept playing ESPN video clips on a screen for more than an hour of real time
  after the game's data had stopped (05-...png). With real video, the "hidden, muted, still playing" design (fullscreen,
  standby views) means paying to decode streams I can't see. I'd want a "pause hidden screens" option on weak hardware.
- **Fewer screens doesn't give a bigger picture on a 16:9 laptop** (medium, 06-two-screens-same-picture-size-1366.png). At
  1366x768, 2 screens are side by side (683x725 cells), and 3 screens are one tall cell plus two small ones. A 16:9 video in a
  683-wide cell is 683x384, about the same as a 4-grid cell (683x362). So going down to 2 screens to save CPU gives me no bigger
  picture, only empty space. Stack 2 screens vertically (or 1 big + 1 small) when the window is wide and short.
- **No way to pick fewer screens without re-testing streams** (medium). Settings → TV service shows the screen count, but the
  only way to change it is "Re-test streams" (with a real service) or editing `.state/setup.json`. I want "Use 2 screens" as a
  plain setting, to save battery.
- **About 25 s of every replay start is an Xfinity sign-in attempt** (low–medium), and 10 minutes without a saved sign-in (see Bugs).
- **The settings drawer just doesn't fit at 768 high** (low). Its content is 771 px in a 726 px drawer, so the last row
  ("Advanced settings") needs a scroll.

## Doesn't work as intended (bugs)
- **Replay/dry run is blocked for 10 minutes by a real sign-in window** (high, 00-replay-blocked-on-signin.png). Steps: fresh
  LOCALAPPDATA (no saved Xfinity session), `.state/setup.json` completed, `npx tsx scripts/start.ts --replay 20261017 --from 19:30
  --speed 20 --no-record`. An "Xfinity On Campus" sign-in window opens. The main window shows "0 live", no tiles, and the real
  wall clock. Nothing happens until `signin.waitForUserMs` (600 s) runs out, then "sign-in failed" and the replay starts. Cause:
  `electron/main.cjs` runs `await handoff()` before `createViews()` whenever signin isn't `defer`, and `src/app.ts` passes
  `signin: 'now'` in every mode. Replay and dry run should pass `defer` (or skip sign-in). It also loads xfinity.com pages that a
  replay never uses.
- **Renderer memory keeps growing** (high for 8 GB). Over a 1.5 h replay, each data-tile renderer went from tens of MB to about
  295 MB private, with a JS heap of only 6–7 MB. In 24 min the renderers together went from 268 MB to 1,057 MB, and the total
  from 2.54 to 3.27 GB. Steps: the replay above. Sample the `electron.exe --type=renderer` processes every 30 s. My guess is that
  the tile pages rebuild their DOM (logos and all) every second. Heap snapshots plus `performance.memory` and the renderer's
  private bytes over an hour would show it.
- **Two screens end up on the same home game** (medium, 05-...png). Late in the day, screen 1's home game (NAVY @ UTSA) ended
  while the screen was filling in with NEB @ ORE. After 120 s the auto-pick made NEB @ ORE its new home (`AUTO_PICK`,
  `duplicate: true`, both candidates "already on another screen"), so screens 1 and 2 showed the same game for the rest of the
  night. It's flagged and allowed as a last resort, but on my laptop a duplicate screen is pure waste. When the only candidates are
  duplicates, a final screen should drop to the picker / an idle card (or fold the grid) instead of a second copy.
- **"Live data (dry run)" tag sits on top of the last-play line** (low, 02-grid-1366x768.png). In every tile at 1366x768 and
  1280x720, the bottom-left tag overlaps the play-by-play text, so neither is readable.
- **The overlay header runs past the screen at 1280x720** (medium, 03-overlay-clipped-1280x720.png). On a screen that's showing
  another game, the header row (game button + "SHOWING OTHER GAME" + "Back to my game") is wider than a 640 px cell. "Back to my
  game" is cut off at the window edge on screen 4 and overlaps the next cell on screen 1 or 3. That's the one button you need at
  that moment. Wrap the row, or drop the badge text in narrow cells.
- **The setup demo ends on "Starting TappedIn…" forever** (low). After "Start watching" in `--setup-demo`, the page stays on
  "Starting TappedIn…". The log says "a real run would start the app now". Fine for a demo, but it should say "Demo finished".

## What's missing
- **A low-power / battery mode** (high for my persona): big ticker off, tiles on push updates, no blur, hidden views paused, no
  standby views, and fewer screens suggested when on battery (`navigator.getBattery()` or Electron `powerMonitor.onBatteryPower`).
- **Hardware in the screen-count step** (medium): "This computer: 4 cores, 8 GB. We suggest 2 screens", next to the stream
  result.
- **An idle state for the end of the day** (low): when nothing is live and the data has stopped, stop the reels and polling and
  show one quiet "No more games, next: …" card.

## New feature ideas
- A small "Performance" line in Advanced settings (app CPU/memory per screen from `app.getAppMetrics()`), so a user can see
  that the big ticker or a 4th screen is the expensive part.
- Text-size control (or auto-size from window height) for the overlay and tiles. At 768 px the play-by-play line and the
  "dry run · REPLAY" tags are about 11–12 px, and the big ticker's label block truncates ("MY SPO…", "SIGN-IN FAILE").
- A "1 big + mini list" layout for small screens: one video plus a narrow column of scores for the others, which costs one
  stream and a bit of text instead of four videos.
