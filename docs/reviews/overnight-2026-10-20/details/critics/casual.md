# TappedIn: casual viewer feedback (critic `casual`)

Who I am: I just want games on the screen. I take every default, click the most obvious button, and don't read docs.
What I did: onboarding with `--setup-demo` (Northeastern → Xfinity On Campus, all defaults), then `--replay 20261017 --from 19:30 --speed 20`
through to the end of the recording, `--replay 20261017 --from 12:00`, and `--replay 20261019-live --from 20:00 --speed 10` (Monday,
multi-sport). Tried the big ticker, per-screen fullscreen (double-click), settings and a game list. Worktree at origin/main 639531f.

## What's good
- Onboarding is short. In the demo it took 4 clicks to finish: Get started → Xfinity On Campus → Test streams → Start watching. Sign-in and the channel scan happened on their own.
- School search is great. "Northeastern" says "uses Xfinity On Campus", and "Boston University" says BU ended campus TV and to use a streaming service.
- "How many screens?" explains the result in one plain sentence and picks the right count for you.
- The halftime reel is the best part: real highlights, "highlight 2 of 12", and the score on top. It feels like a real TV product. (07)
- The big ticker looks polished (logos, TOUCHDOWN flags, possession dot). The button stays in the same corner when the ticker is on, so turning it off was easy. (05)
- Double-clicking a screen to fullscreen it is what I tried first, and it worked. "Screen 3 · Exit" is in the top bar, Esc goes back, and the sound moved to the big screen and came back after. (06)
- Game over is calm: a picker, then after 2 minutes it picks a good next game by itself. I never had to do anything.
- Settings → Basic is short, and the Low/Medium/High lines are in plain English.

## What's confusing
- **"Xfinity sign-in failed" stays in red the whole time in replay.** (medium) In a replay that shows data tiles, a red "sign-in failed" chip stays in the top bar for the whole session. To me that means "it's broken." In replay or dry run, either hide it or say "Not signed in (not needed for replay)". (04, 08)
- **"Live data (dry run)" and "dry run · REPLAY" show in replay mode.** (low) The chip says REPLAY, but every screen also says "dry run". Those are two words for one thing, and I don't know what either one means. Something like "Recorded game · no video" would be clearer. (08, 10)
- **The "why" line is full of numbers.** (medium) Example: "Showing ND 3–7 BYU · Same sport: 5:06 - 1st · FSU @ MIA: timeout · ~0:21 left (10%)". What is 10%? 10% of what? A casual reader needs only "Your game (FSU @ MIA) is in a timeout. Back soon." Keep the percent and the forecast in a tooltip or the advanced view. (04)
- **"UNKNOWN" and "NO DATA" badges.** (medium) When ESPN data stops, every screen shows a grey UNKNOWN badge and the app keeps saying "5 live". To me that's scary or meaningless. Say "Waiting for scores…" and how long it's been. (11)
- **Sport chips in Settings and the ticker use league codes:** MCBB, WCBB, UCL, LIGA, ATP, WTA. (low) Tooltips exist, but nobody hovers over a chip. Write "Men's college hoops" and so on, or show the name under the code.
- **Halftime reel shows two scores that disagree.** (low) The header says "NEV 11 - 19 NDSU", and the caption under the clip says "NEV 11-12 NDSU". The second one is the score at the time of that clip, but nothing says so. Label it, for example "then: 11-12". (07)
- **Top-bar icons have no words.** (low) The ticker button looks like a tiny keyboard or card. I found settings (gear) and window fullscreen (corners), but I'd never have guessed what the ticker icon does.
- **"1 stream documented" and "streams depend on your plan" on the service list** don't mean anything to me at that step. (low) Also, only one service is "Tested", but it sits third in its group, after two "Experimental" ones. Put the tested one first or mark it "Recommended". (01)

## Slow or clunky
- **Replay or dry run waits 10 minutes for an Xfinity sign-in before showing anything.** (high) With no saved sign-in (new computer, expired session, or someone who just wants to try a replay), `--replay` opens the Xfinity On Campus page. The main window shows four "Choose a game" screens and nothing happens until the sign-in times out after `waitForUserMs` (600000 ms, 10 minutes). Only then does the replay start (log: 01:33:18 "needed" → 01:43:18 "failed" → replay). A casual user closes the app long before that. Replay and dry run don't need video, so they shouldn't wait for sign-in at all (`electron/main.cjs`: `if (value('signin','now') !== 'defer') await handoff()` runs before `createViews`/ready, and `src/app.ts` passes `signin: 'now'` whenever setup is done). Steps: fresh LOCALAPPDATA, setup.json completed, `npx tsx scripts/start.ts --replay 20261017 --from 19:30 --speed 20`. (03)
- **The grid changes a lot.** (medium) Over 7:38–10:25 PM on 10/17 (Low, the default), each screen changed what it showed about 17 times an hour, so with 4 screens something changes about every 50 seconds. About a quarter to a third of stays lasted under 90 s. Many of those were short trips back home, for example S1 back on NEV @ NDSU for about 20 s and then off to another game again. I sampled the state once per real second (about 20 s of game time), so the durations are approximate. Each switch makes sense on its own, but as a whole it feels busy, not calm. A short "stay home at least N seconds once back" would cut the flicker.
- **The sound stays on screen 1, even while screen 1 is on a fill-in game.** (low) Default is "You pick". It's not wrong, but I never chose screen 1. I'd expect "Follows the action" to be the default for someone who doesn't touch settings.

## Doesn't work as intended (bugs)
- **Three screens fill in with the same game in the first 35 seconds.** (high) `--replay 20261017 --from 19:30`: the startup picks NEV@NDSU, ARK@VAN, FSU@MIA and TCU@BAY. Within 35 s, S4, S2 and S1 all switch to FSU @ MIA (`BREAK_FILL … [DUPLICATE: only option]`), so all four screens show the same game. To a new user, the very first thing the app does looks broken. Most other games had just kicked off and weren't counted as in play yet. Suggestions: don't fill in with a game already on screen in the first minute or two, or hold on the home game when the only option is a duplicate. (04)
- **"--from 12:00" on 10/17 shows four black boxes labelled RZ-SCREEN-1…4 for hours.** (high) The 20261017 recording starts at 6:31 PM ET (first scoreboard line 22:31Z). `--from 12:00` doesn't warn about that. It shows "0 live" and four black views with internal names, and at 10x it would sit like that for about 40 real minutes. Show an empty-screen message ("No games yet. Data starts at 6:31 PM") and never show the RZ-SCREEN-n debug title to users. (09)
- **When there's nothing to watch, a screen stays black with "RZ-SCREEN-4".** (medium) On Monday (`--replay 20261019-live`), screen 4 remembered "College Football", had "NO CFB GAMES TODAY", and the only watchable games were already on screens 1–3. It just stayed black, with no "nothing else on your channels right now" message and no button. (10)
- **The end of a replay looks frozen.** (medium) After "replay finished" (00:32), screens stay on UNKNOWN / NO DATA, halftime reels loop forever, and the top bar still says "4 live". The app should say "Replay over." (08)
- **A data gap looks the same as a freeze.** (low; the recording is at fault, the UI isn't helping) 20261019-live has no scoreboard data from 8:12 to 10:17 PM. The app showed UNKNOWN on every screen, "5 live", and a mini ticker still rotating tennis finals. Nothing tells you the data stopped. (11)
- **Small layout overlaps.** (low) The tile's "→ LOU @ SYR · Live data (dry run)" tag sits on top of the play-by-play line. On the halftime reel, the "🔊 Halftime highlights" tag sits on the clip caption. The big ticker's label block cuts off "SAT OCT 17 · MY SPO…" and "REPLAY SIGN-IN FAILE". (07)
- **README has broken paths:** "config<TAB>appedin.config.json5" (line 96) and "scripts<BACKSPACE>uild-installer.ps1" (line 100). (low) A `\t` and a `\b` got turned into control characters.

## What's missing
- **A "try it without a TV service" path in setup.** (medium) A demo or replay button on the welcome screen would let a casual user see what the app does before signing in. Right now that only exists as command-line flags.
- **A one-line explanation of what a fill-in is the first time it happens.** (medium) The first time a screen switches, a toast like "Your game went to commercial, so we're showing another one. Back when play resumes." would remove most of my confusion.
- **An empty-state message inside each screen** (no game, no data, replay over) instead of a black view or a frozen tile.

## New feature ideas
- **A "Calm" level below Low:** only quarter breaks, halftime and game over. It's for people who mostly want 4 games on and only occasional switching.
- **Recommended service first,** and a "Not sure? Search your school" prompt as the main path. That worked well, so make it the first thing you see.
- **A "Replay over / Start again" card** with a button to pick another recorded day, for demos.

## Top 8 (one line each)
1. Replay or dry run waits 10 min for an Xfinity sign-in before starting (no sign-in = nothing happens). (high)
2. In the first 35 s of the 10/17 7:30 PM replay, three screens fill in with the same game (FSU @ MIA), so all four show one game. (high)
3. `--from 12:00` on 10/17 (data starts 6:31 PM): four black "RZ-SCREEN-n" boxes, "0 live", no explanation. (high)
4. The grid changes about every 50 s across 4 screens (about 17 changes per screen-hour at Low), with many 20–40 s trips back home. Busy, not calm. (medium)
5. The red "Xfinity sign-in failed" chip stays up through a whole replay that doesn't need sign-in, plus "dry run" labels in replay. (medium)
6. Empty and stopped states (nothing to watch, data gap, replay over) show black screens, UNKNOWN badges or frozen reels, and never a plain message. (medium)
7. The "why" line is full of numbers ("~0:21 left (10%)"); casual viewers need a plain "your game is in a timeout, back soon". (medium)
8. League codes (MCBB/WCBB/UCL/LIGA), an unlabelled ticker icon, and halftime reels showing two different scores. (low)

Not checked: the real Xfinity sign-in (not allowed), live video, Medium/High levels, Advanced settings, NFL/MLB switching on Monday
(the recording has no data from 8:12 to 10:17 PM). To get past item 1 on later runs, I set `.state/providers/xfinity-on-campus.json`
`{"signin":{"waitForUserMs":5000}}` in my sandbox only. winshot.ps1 captured only about the left 1550 px of the 1920 px window,
so some screenshots are cut off on the right.
