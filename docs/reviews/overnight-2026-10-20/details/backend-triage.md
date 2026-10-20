# Backend triage (reviewer #7): critic-reported bugs

Worktree: `C:\Users\omcau\code\redzone-wt\triage-review` (origin/main 639531f). Done; all 10 PRs merge together cleanly (scratch merge: 416 tests, typecheck pass).

Candidates: first-timer 1-7, philo-student (a)-(d).

## C2 / philo "auto-pick makes another screen's home this screen's home" (high) — FIXED, PR #30
https://github.com/omcaul13/redzone/pull/30 (branch overnight/fix-gameover-duplicate-home)
Reproduced with the real 10/17 recording (sim from 18:32): 19:16:17 S2 AUTO_PICK FSU @ MIA [DUPLICATE] (S1's home) while
TCU @ BAY (FS1) was live, on no screen, but in a commercial (assessment BREAK). Cause: src/engine/director.ts game-over
path uses the fill-in ranker, which only takes in-play games (ranker.ts rankCandidates `assessment.state !== 'LIVE'`).
Fix: when the pick is a duplicate, retry including live games in a break. Golden unchanged; sim then has 0 duplicate auto-picks.
Left as is (design): an existing duplicate home is never re-homed later.

## philo (b) Closing Diagnostics restarts the replay (low-medium) — FIXED, PR #31
https://github.com/omcaul13/redzone/pull/31 (overnight/fix-replay-restart-after-diagnostics)
src/app.ts diagAction('close') -> startNormal -> runReplay again; stopNormal never stops the replay feed loop (it only
stops a LiveSource), so the clock jumped back to --from and two feed loops ran. Live/dry-run: no restart (a new
LiveSource); the re-tune on close (restoreAll + resyncController) is intended (diagnostics borrow screen 1).

## C3 Replay waits for the Xfinity sign-in (high for testers) — FIXED, PR #32
https://github.com/omcaul13/redzone/pull/32 (overnight/fix-replay-no-signin)
app.ts start passed signin 'now' in every mode; electron/main.cjs awaits handoff() before 'ready'; App.start awaits ready
before startNormal. Now 'now' only in live mode. Still open (report): main.cjs portalHandoff ignores the user closing
the portal window (waits waitForUserMs = 10 min); interactiveSignin handles it.

## C1 / philo (a) False "Signed in" (high) — YouTube TV FIXED (PR #33), Sling NOT fixed
https://github.com/omcaul13/redzone/pull/33 (overnight/fix-youtube-welcome-signed-in)
The "/\bSign in\b/" slash form is NOT the bug: it's the documented "/source/flags" convention (types.ts compileRegex,
signin-rules.cjs compile), case-sensitive on purpose (existing tests). All 8 provider configs compile as intended.
Real cause for YouTube TV: signed out, /live lands on tv.youtube.com/welcome/, which matched shell.appUrl, and its text
has no "Sign in". Fix: appUrl excludes /welcome. Sling: Freestream shows dashboard/guide pages without an account,
so a text-absence check (signedOutPattern on the first 4000 chars) can't tell; Diagnostics' sign-in step uses the same
check, hence the false ✓. Recommendation: a positive signed-in signal per provider (e.g. signedInPattern/selector for
an account/profile element). Schema + site research, not done overnight. General weakness: an empty/unrendered page
also counts as signed in (main.cjs streamSignedIn after checkSettleMs).

## philo (b2) / old-laptop (o): see C3 (PR #32), confirmed by 4 critics; dry run is fixed the same way.

## cfb (g) Sound "Follows the action" forgotten on restart (medium) — FIXED, PR #34
https://github.com/omcaul13/redzone/pull/34 (overnight/fix-sound-mode-saved)
README: Basic settings (sound included) "are saved in .state/settings.json"; OverridesSchema (config.ts) had no audio key
and /api/audio + the audioMode hotkey only set the engine. Added the audioMode override.

## cfb (e) 3-4 screens on one game / duplicate homes / screenSports all nhl (high) — partly fixed (PR #30), rest is design
Duplicate fill-ins are flagged "[DUPLICATE: only option]" and allowed by director.allowDuplicates (default true, README
rule 4): not an invariant bug (invariants hold in sims). The auto-pick duplicate home with a free game in a commercial is
fixed by PR #30. When every live game really is on a screen, auto-pick still adopts a copy as the home, and app.ts
handle() then saves its sport (setScreenSport on AUTO_PICK) -> screenSports nhl,nhl,nhl,nhl. Recommendation (design):
an auto-pick shouldn't adopt a duplicate home (stay on the picker/final), and an auto-pick shouldn't save the screen's sport.

## cfb (f) / multi-sport (j) Auto-pick takes a 20-pt game over a tied one; NHL screen auto-picks CFB (high) — NOT fixed (tuning)
Same root cause: the game-over auto-pick (director.ts GAME_OVER path) uses the fill-in ranker, which takes only games
in play (assessment LIVE); a tied game in a commercial (CIN @ WVU) or an NHL game at a whistle is invisible to it, while
the picker list (app.ts pickerFor) sorts all live games by sport then margin. The 3-tier rule holds, but only among
in-play games. Ranking all live games (incl. breaks) for the auto-pick changes all 4 CFB golden sequences (tried it), so it's
tuning: owner's call. Recommendation: auto-pick = first entry of the picker list, or rank with includeBreaks (PR #30
adds the option).

## cfb (h) Picking a game on a locked screen unlocks it (medium) — not a bug by the docs; design gap
director.ts applyAction setHome sets mode HOME (force = pick + lock). README only says "Lock: no automatic switching";
nothing says a manual pick keeps the lock. Recommendation: keep LOCKED on setHome for a locked screen (or say so).

## cfb (i) Halftime reel -> game -> reel in 100 s (TCU @ BAY 20:38, real 10/17) (medium) — NOT covered by PR #29; not fixed
Separate path. Raw ESPN data flapped: 20:38:01 "End of 2nd" (HALFTIME) -> 20:38:13 "15:00 - 3rd" (LIVE) -> 20:39:25
STATUS_HALFTIME. The second HALFTIME resets phaseSince, so statusOutcome (breakDetector.ts:55) returns LIVE ("halftime on
ESPN, end of half still on the stream") while the detector was in BREAK; the director (HALFTIME_REEL + home LIVE) ends the
reel (HALFTIME_OVER), then 6 s later HALFTIME starts it again. Recommendation: when ESPN re-enters HALFTIME and the
detector was BREAK/HALFTIME, don't report LIVE (keep the previous state until visible); or end the reel only on a new
play. Touches both detectors (forecastDetector.ts is in open PR #26): not done overnight.

## C5 / philo: replay before the recording starts shows "No games today" (medium) — FIXED, PR #37
https://github.com/omcaul13/redzone/pull/37 (overnight/fix-replay-before-recording)
app.ts runReplay started the clock at --from and waited (first record - from)/speed. Now starts at the first record.

## C6 / cfb: big ticker "RED ZONE" stays up after the drive leaves it (low) — FIXED, PR #38
https://github.com/omcaul13/redzone/pull/38 (overnight/fix-ticker-stale-moment)
src/ui/ticker/model.ts TickerAlerts: a "moment" alert lasted a fixed 45 s (MOMENT_MS); now dropped when the hot moment changes.
(Score alerts at halftime, "TOUCHDOWN FLA" for 75 s, are intended.)

## C7 README control characters (low) — FIXED, PR #36
https://github.com/omcaul13/redzone/pull/36 (overnight/fix-readme-control-chars). Lines 96/100; test keeps them out.

## a11y (p) Game menu opened from the keyboard leaves focus on the button (medium) — FIXED, PR #35
https://github.com/omcaul13/redzone/pull/35 (overnight/fix-game-menu-search-focus). Preact autoFocus has no effect on an
input mounted later (verified in an Electron harness); ref + effect. No repo test (no DOM test env). Merges clean with #15.
Same autoFocus pattern in src/ui/onboarding.tsx:165 (service search): likely same issue, not changed.

## C4 No way back after the sign-in step (high UX) — design gap, not a bug
runner.go(step) + /api/setup/go already accept 'service' from any step (app.ts:810); only the Sign-in step's UI has
"Choose another service" (onboarding.tsx:222). Channels ("No channels found"), Playback, Streams and "How many screens?"
don't offer it. Recommendation: add the same button to those steps (UI only, one line each).

## philo (c) Empty screens black with "RZ-SCREEN-n"; a carried game going live never fills them (medium) — design gap
Screens the startup pick doesn't fill never get a controller command, so they keep the Electron marker page
(main.cjs marker(label)); the controller only shows /idle/N when it applies a want of kind none (controller.ts:350).
The director skips IDLE screens and the startup pick runs once (app.ts homesSet), so a game that starts later never
fills them. Recommendation: send homeless screens to /idle/N after the startup pick, and optionally auto-fill an IDLE
screen when a watchable game goes live. Not fixed (behavior change; controller.ts is in open PR #16).

## philo (d) Game-over picker lists two games on the same channel (medium) — not a bug in code; design
pickerFor (app.ts) lists every watchable live game; ESPN listed FSU @ MIA (OT) and UTAH @ COLO both on ESPN (one is
really on overflow). autoHomes de-duplicates channels; the picker doesn't. Recommendation: mark or drop the second
game on a channel already showing another one.

## multi (k) "Use for all screens" partial, puts a not-started game on a screen, "no message" (medium) — message FIXED, PR #39 https://github.com/omcaul13/redzone/pull/39
Partial job and pre-game picks are by design (README: "like the startup pick", which takes games starting within 45 min).
But app.ts allScreensSport returns { ok: true, message: 'Only N watchable … free right now…' } and the UI's run()
(screen.tsx:67-70) shows a message only when ok is false, so the intended message is dropped. Recommendation: in
GameMenu.choose shows r.message for this call (PR #39; no DOM test env, so no test).

## multi (l) Two game-over pickers in per-screen fullscreen (medium) — UI, report only
The overlay pop-up (UI) and the in-screen picker page (tile page #pop / pickerPage) both render with separate countdowns.

## multi (m) MLB "End 5th"/"Mid 6th" used as fill-in at Low: PR #26 covers it only partly
Sim 20261018-live from 18:30: main picks TB @ CLE as a fill-in at Mid 5th 18:36:39, End 5th 18:44:15, Mid 6th
18:50:31 and 18:52:31. With PR #26: Mid 5th 18:37:35, End 5th 18:45:33, Mid 6th 18:52:31 (one removed, the rest
~1 min later). PR #26 blocks the first ~85 s of an inning break (forecast >= candidateMaxBreakRisk); later in the same
break the game is eligible again. Further change = tuning.

## a11y (q) S/T hotkeys work during onboarding; T saves a setting (low) — design; main.tsx is in PR #15
Recommendation: ignore window hotkeys while st.setup is set (one line in main.tsx's handler; conflicts with #15's line).
## a11y (r) Tab reaches invisible (opacity 0) overlay buttons; Enter fullscreens (high a11y) — report only
Fix is CSS (.ov:focus-within to show the head) in src/ui/style.css, a collaborator file I must not edit.
## a11y (s) Esc doesn't dismiss the game-over picker — not specified (README: Esc closes an open menu, then leaves
fullscreen; the picker's own "Not now" cancels). Design choice.
## cfb (h)-adjacent: halftime reel keeps playing for an hour when its game's data stops (old-laptop) — design
director.ts:364 deliberately keeps a reel while the home game is UNKNOWN; halftimeMaxSeconds is checked only while
ESPN says HALFTIME. At the end of a recording everything is UNKNOWN, so the reel runs forever. Recommendation: apply
halftimeMax in the UNKNOWN case too (director.ts, also in PRs #29/#12/#30).

## old-laptop (n) Renderer memory growth (268 MB -> 1,057 MB in 24 min; ~295 MB per tile renderer) — no page leak found
Measured: the real tile, picker and halftime pages (src/server/pages.ts via startServer) in this repo's Electron, 4 hidden
windows with backgroundThrottling off, fed a synthetic 60 KB state that changes every second, 10 min + a 5 min pass with
a forced GC before each sample (CDP Memory.getDOMCounters, performance.memory, app.getAppMetrics).
Result: flat. Working set 76 -> ~90 MB per renderer in the first 30 s, then steady (tile 87-99 MB, halftime 86-92 MB);
JS heap 1-6 MB; after GC DOM nodes constant (tile 47/158, halftime 479), listeners constant (no stacking intervals).
Without forced GC the halftime page's node count drifts up between V8 GCs (garbage, not retained). hideAll() already
releases <video> (removeAttribute src + load()). Not covered by my harness: real ESPN MP4 clips/YouTube in the reel,
the Preact UI view, and Electron's own per-view overhead; the critic's growth is more likely there (or in Chromium
media/compositor memory, which isn't JS heap). Design (report): every tile, picker and reel polls the full /api/state
(~65 KB) every 1-3 s even when hidden behind a fullscreen screen; the UI already has SSE (/api/events) that pages could use.
Also: a reel keeps playing while its game is UNKNOWN (see the halftime note above).
