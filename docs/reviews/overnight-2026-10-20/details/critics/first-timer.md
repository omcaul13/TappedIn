# TappedIn: first-timer feedback (critic id: first-timer)

I'm using TappedIn for the first time. I skimmed the README and went through setup from the very first screen: real setup with
Sling TV and YouTube TV, without signing in, then `--setup-demo` for the steps that need a sign-in. After that I watched the
recorded CFB Saturday (`--replay 20261017`, 18:32-19:50 ET at 5x, about 80 minutes of game time). I tried picking games,
fullscreen, both tickers, settings, a halftime reel and four game-overs.
Sandbox: worktree at origin/main `3dce3ca`, ports 7501/9401/9451, LOCALAPPDATA redirected. Decisions are in the worktree's
`logs/replay-20261017.jsonl` (33 BREAK_FILL, 14 FILL_REPLACE, 22 HOLD_DWELL, 31 RETURN_HOME, 4 AUTO_PICK).

## What's good (short)

- The welcome screen is calm and honest: what the app does, the privacy promise, "about two minutes", and one button.
- The service picker is clear. Campus and streaming services are in separate groups, each has a Tested/Experimental badge, and
  school search works ("Northeastern" finds Xfinity On Campus).
- The stream test and the "How many screens?" step say what was measured and why ("Your plan played 3 streams at once (Xfinity
  documents 1)"), and warn that your phone or TV uses streams too. (`07-demo-how-many-screens.png`)
- Per-screen fullscreen (key 2), Esc/0 to go back, and the big ticker (T) all worked the first time, with no reloads. The big
  ticker looks great. The red outline on a red-zone game is a nice cue.
- The game-over pop-up is easy to read: the final score, same-sport games first, a countdown, and "Not now (stay here)".
  (`14-game-over-picker.png`)
- The halftime reel came up by itself with real ESPN clips and "highlight 1 of 27". (`16-halftime-reel.png`)
- When I hover a screen that's showing another game, the "why" line does tell me why it changed ("Showing ALA 10-19 TENN · Same
  sport: ... · UNC @ DUKE: kickoff after a score · ~2:05 left").

## What's confusing

- **Setup says I'm signed in when I never signed in (high).** I picked Sling TV, then YouTube TV, and did nothing. Each time
  setup ticked "Sign in" green within about 6 s, then failed at Channels. Anyone would think the sign-in worked and the app is
  broken. Details are in bug 1. (`05-youtube-false-signed-in.png`)
- **There's no way back once you're past the sign-in step (high).** When Channels says "No channels found", the only buttons
  are Diagnostics and Scan again. There's no Back and no "Choose another service", and the step pills at the top can't be
  clicked. The only way out I found was to close the app and start it again, which goes back to Welcome. If you picked the wrong
  service, you're stuck.
- **School search can dead-end (medium).** Typing "boston u" shows "BU ended campus TV in May 2025. Use a streaming service you
  subscribe to." Under that it says "No service matches", and the service list is hidden, so you have to clear the box to pick
  the streaming service it just told you to use. "UCLA", "Ohio State", "hulu" and "fubo" all just say "No service matches ...
  (see CONTRIBUTING.md)". Someone who installed the .exe doesn't know what CONTRIBUTING.md is. The README lists Hulu + Live TV
  and Fubo as "Not supported yet", but the app never says so. (`03-search-bu-dead-end.png`)
- **Errors are written for developers (medium).** YouTube TV's Channels step showed "Couldn't read the channel guide:
  page.waitForSelector: Timeout 30000ms exceeded." Diagnostics talks about selectors and "Edit all fixes as JSON". That's fine
  for the maintainer. A first-timer needs something like "We couldn't open your YouTube TV guide. Are you signed in? [Open
  sign-in window] [Choose another service]".
- **Why it picked a game is unclear (medium).** At the start it put WSU 0-7 ORST (1st quarter) on a screen and left ALA @ TENN
  (#6 vs #14, 9 points, 4th quarter) for fill-ins. Later the game-over countdown picked NEV @ NDSU (an FCS opponent, 0-0 at
  kickoff) over FSU @ MIA, ARK @ VAN and TCU @ BAY. "Best live game in 1:10" doesn't say which game it will pick, so I can't
  object in time. (`14-game-over-picker.png`)
- **Mode words on every tile (low).** In replay, every tile says "dry run · REPLAY" and "Live data (dry run)", and the top bar
  has a REPLAY chip too. It's a replay, not a dry run. Empty screens show internal names ("RZ-SCREEN-2/3/4").
  (`10-replay-1530-no-games-today.png`)
- **"you picked" when I didn't (low).** The startup pick is logged as `USER_SET_HOME ... you picked PSU @ MICH as home`, and so
  are the auto-picks after a game-over.
- **"(77%)" and "Same sport:" in the why line (low).** With only CFB on, "Same sport" is noise, and nothing in the window
  explains the bare percentage. "Likely ~2 min of commercials" would read better.

## Slow or clunky

- **A broken experimental service takes 30 s to fail at Channels (medium).** The spinner only says "Reading your channel
  guide…", with no hint that it's taking longer than usual.
- **Screen headers don't fit at half width (medium).** On a screen that's showing another game, the header row (game pill,
  SHOWING OTHER GAME, Back to my game, lock, sound, fullscreen) is wider than the screen, so lock, sound and fullscreen are cut
  off at the right edge. I measured scrollWidth 803 px against 767 px on a 1536x912 window, which is any 1920x1080 laptop at
  125% scaling.
- **The "Live data (dry run)" / "Halftime highlights" tag is drawn on top of the last-play text** at the bottom left of every
  tile (low). (`08-first-look-grid.png`, `16-halftime-reel.png`)
- **The service list scrolls inside a short box (low).** At 1536x912, Xfinity Stream and YouTube TV are cut off at the bottom of
  an inner scroll area, with empty space under the card. The only Tested service (Xfinity On Campus) is 3rd in alphabetical
  order rather than first.
- **The demo ends on a spinner (low).** `--setup-demo` finishes on "Starting TappedIn…" and stays there, even after a reload. The
  log says "a real run would start the app now". The window should say so too.
- **The first 10 minutes are busy.** Screen 2 switched 1 min 23 s (replay time) after start, and in about 80 minutes of game time
  the four screens switched 33 times and swapped fill-ins 14 times. Because the always-visible tag is a tiny gray "filling in for
  UNC @ DUKE" in a corner, I kept wondering "wait, which game is this?".

## Doesn't work as intended (bugs)

1. **YouTube TV / Sling sign-in counts as "ok" while signed out (high).** Steps: start with an empty `.state`, click Get started,
   pick YouTube TV, touch nothing. About 6 s later "Sign in" is ticked and Channels starts. The log says `YouTube TV sign-in: ok
   (Signed in to YouTube TV)`, but the hidden page is `tv.youtube.com/welcome/...`, the signed-out landing page. Sling does the
   same on `watch.sling.com/dashboard/grid_guide`: Sling's free tier shows a guide without an account, and the scan then reads 8
   rows and finds no sports channels. A likely cause for YouTube TV: `signedOutPattern` in `config/providers/youtube-tv.json` is
   `"/\\bSign in\\b/"`, with literal slashes, so it may never match. (`05-youtube-false-signed-in.png`)
2. **Replay won't start without a real sign-in (high, for "try it first" users and for testers).** Steps: have a
   `.state/setup.json` for Xfinity On Campus and no saved sign-in, then run `--replay 20261017`. The app opens the real Xfinity
   On Campus page and waits: "0 live", four empty "Choose a game" screens, and a toast saying "Sign in to Xfinity On Campus in the
   window that opened". Closing the sign-in window doesn't unblock it, and there's no Skip button. Replay only shows data tiles,
   so it shouldn't need the service at all. (`09-replay-blocked-by-signin.png`) I got past it by setting up YouTube TV, which
   "signs in" by itself (bug 1).
3. **Two screens get the same home game after a game-over (high).** At 19:16:19 screen 2's auto-pick set its home to FSU @ MIA,
   which was already screen 1's home (`AUTO_PICK ... [DUPLICATE: only option]`; the only candidates were FSU @ MIA and WSU @
   ORST). TCU @ BAY wasn't a candidate because it was screen 3's fill-in for those few minutes, and ARK @ VAN wasn't either (I
   didn't find out why). So a permanent home choice was based on what other screens were showing just then. Nothing fixed it
   later: at 19:30 screens 1
   and 2 both had FSU @ MIA as home, while ARK @ VAN (ESPN2) and TCU @ BAY (FS1) were live and on no screen. From then on both
   screens even switched to fill-ins together. (`15-two-screens-same-home-game.png`)
4. **I missed a go-ahead touchdown because a duplicate swap restarted the minimum time on a substitute (high).** At 19:00:53,
   screen 2's home game UNC @ DUKE (4th quarter, ~2:00 left, one-score game) was on fill-in WSU @ ORST. `FILL_REPLACE` swapped it
   to ASU @ TTU (a 28-point blowout) because WSU @ ORST was also on screen 1, even though the home game had only "~0:21 left
   (14%)" of break. The swap restarted the 30 s minimum, so when UNC @ DUKE came back at 19:01:20 with a 24-yard rushing
   touchdown, the screen stayed on the blowout ("4s left on the substitute first"). The same hold hit other close finishes:
   - 18:56:28, screen 3: AUB @ UGA tied 24-24 with 0:58 left in the 4th stayed on WSU @ ORST for 22 s after play resumed.
   - 18:38:36 and 18:45:55, screen 1: PSU @ MICH (4th quarter) held 20 s and 12 s.

   In the last 2-3 minutes of a close game, going back when play resumes should win over the minimum time.
5. **The same game on two screens during fill-ins (medium).** At 18:48:24 screen 4 (my pick, ALA @ TENN) filled in with PSU @
   MICH, which screen 1 was already showing (`[DUPLICATE: only option]`). At 19:03:59 screen 2 filled in with NEV @ NDSU, which was
   screen 3's home. The why line says "(also on another screen)", but seeing the same picture twice looks like a bug to a
   newcomer. The README says duplicates need `director.allowDuplicates`, yet this happens with the default config.
   (`13-settings-basic.png`: screens 1 and 4 both on PSU @ MICH)
6. **Replay from before the recording starts says "No games today" (medium).** With `--replay 20261017 --from 15:30`, the app
   shows "0 live" and "No games today" for every sport, College Football included. That lasts about 18 real minutes at 10x,
   because the recording starts at 18:31 ET. `--replay 20261019-live` works as a value, but its default start of 19:00 hits the
   same wall: the recording starts at 19:59. The app should say "Recording starts at 6:31 PM" and jump there, or jump by itself.
   (`10-replay-1530-no-games-today.png`)
7. **The halftime reel spoils games in a replay (low, replay only).** At WSU @ ORST's halftime (19:45 in the replay), the first
   clip was ND @ BYU "diving TD grab to give BYU late lead", 4th 1:51. In the replay that game was 0-0 and had just kicked off.
   The clips are fetched today, not from the replay day. (`16-halftime-reel.png`)
8. **The big ticker's RED ZONE label stays too long (low).** The big ticker showed ALA @ TENN as "RED ZONE" while the game state
   said ALA 35 / ALA 25 with `isRedZone: false`. The moment alert lasts a fixed 45 s whatever happens in the drive, which at 5x
   replay is almost 4 game minutes.
9. **The 3-screen icon doesn't match the grid (low).** "How many screens?" draws 3 screens as one tall screen on the left and two
   on the right. The grid behind it has two on top and one at the bottom left. (`07-demo-how-many-screens.png`)
10. **The README has broken paths (low).** Lines 96 and 100 show "config<TAB>appedin.config.json5" and
    "scripts<BACKSPACE>uild-installer.ps1": `\t` and `\b` were turned into control characters.

## What's missing

- **A "try it without signing in" path (high).** The README and the app both assume a working TV account. A "watch a recorded
  Saturday" button on the Welcome screen would show a new user what auto-switching looks like before they sign in to anything,
  and would make bug 2 go away.
- **Back / Change service on every setup step (high).** See above.
- **A short "what just happened" on each switch for people who aren't hovering (medium).** A 3-5 s banner on the tile, like
  "Commercial on UNC @ DUKE: showing ALA @ TENN. Back when play resumes", would teach the app in the first 10 minutes.
- **A floor for fill-ins (medium).** Close 4th-quarter games got filled with ASU 17-52 TTU and later 17-53, because a red zone
  counts as "hot" even in a 36-point blowout. I'd like to never get blowouts (e.g. more than 21 points in the 4th) as fill-ins,
  or to have closeness rank above red zone in garbage time.
- **The first play after a break (medium).** A screen goes back home only after ESPN logs the first play, so that play is often
  missed. For example, screen 3 went back to WSU @ ORST at 19:23:42 on "play resumed: Passing Touchdown". Going back slightly
  before the predicted end of a long break (e.g. at an end of quarter) would avoid that.
- **Channel numbers that mean something for your service (low).** Until a scan succeeds, the TV service page for YouTube TV lists
  "ESPN channel 849" and "ABC channel 805", which are Xfinity Boston numbers.

## New feature ideas

- **"Protect the finish":** in the last N minutes of a one-score game, never leave the home game (or leave only for an official
  timeout), and always go back at once when play resumes.
- **Explain the startup pick:** on the first launch, a one-time card saying "TappedIn picked these 4 games (the closest ones on
  channels you get). Change any of them from its game list."
- **A 3-tip tour on first launch:** the game list, Lock, and Back to my game, plus the keys (1-4, T, S, Esc). I only knew the
  keys from the README.
- **"While you were away":** if the app was away during a score in your home game, show a small note in the tile, like "TD UNC
  while you were on ASU @ TTU".
