# Multi-sport fan: feedback (critic id `multi-sport`)

Who I am: I want NFL, NBA, NHL and tennis on four different screens at once and let the app fill each screen's breaks.
What I ran (all replay, data tiles, no real sign-in): `20261018-live` from 18:30 (Sunday: NFL, NHL, MLB, MLS),
`20261019-live` from 20:00 (Monday: NHL, WNBA, MLB, NFL), `20261019` from 22:00 (tennis only), and
`20261017 --synth` from 19:00 and 19:42 (CFB + NHL + soccer rebuilt from finals: the only day where I could watch an NHL game).

Bottom line: I could never get my four-sport setup. No recorded day has NFL + NBA + NHL + tennis live at the same time (NBA
has "No games today" on every October day; NHL is ESPN+ only on 10/18 and 10/19; tennis is a separate tennis-only recording),
so I tested the pieces on different days. The picking UI is good; the fill-in logic is where a multi-sport viewer gets hurt.

## What's good (short)
- The per-screen sport grid ("PICK A SPORT FOR SCREEN 3", "NFL · 4 games · 3 live", greyed sports with no games) is clear and quick (`02-sport-grid-screen3.png`). Choosing a sport per screen is obvious.
- Sport-specific breaks are recognized: NHL "TV timeout", "End of regulation", intermissions (badge says INTERMISSION, the reel had real NHL clips); tennis set breaks ("Set break over on your screen (128s)"); NFL two-minute warning.
- The tennis game-over pop-up is great (`07-tennis-game-over-picker.png`): tournament, round, court, set and games, and hot tags like DECIDING SET and "LINETTE A GAME FROM THE MATCH".
- Game list tags (`S2's game`, `REGIONAL`, `streaming only: ESPN+`) explain at a glance why something can't or shouldn't be picked.
- The "why" line on a fill-in names the tier ("Other screen's sport (MLB): ... (also on another screen) · LAC @ KC: timeout · ~1:43 left (80%)"). Very honest.
- Per-screen fullscreen (key `2`) is instant and the big ticker stays on top; nothing reloads.
- The big ticker is grouped by sport and shows sport-specific state (END 1ST for NHL, BOT 6TH / RUN CLE for MLB, 79' for MLS, TOUCHDOWN LAR / FIELD GOAL LV for NFL).

## Doesn't work as intended (bugs)

### Replay / dry run with setup done still tries a real Xfinity sign-in and blocks for 10 minutes (high)
Steps: write the documented `.state/setup.json` (setup completed), start `--replay 20261018-live`. The app opens the real
xfinityoncampus.com page in a window, logs "Sign in to Xfinity On Campus in the window that opened", and the replay does not
start (no screens, "0 live") until `signin.waitForUserMs` (600 s) runs out. Replay and dry run use data tiles and never need the
service, so the shell should start with `--signin=defer` in those modes (`src/app.ts` passes `signin: inSetup ? 'defer' : 'now'`
regardless of mode). I worked around it with a local `.state/providers/xfinity-on-campus.json` pointing the sign-in URLs at a
dead local port; the top bar then shows a red "Xfinity sign-in failed" chip for the whole replay, which is also wrong for a replay.

### Three of four screens end up on the same baseball game (high) - `03-three-screens-same-mlb-game.png`
Sunday 10/18 18:30 on, four NFL/MLB homes (S1 TB @ CLE MLB auto-picked, S2 ARI @ LAR, S3 BUF @ LV, S4 LAC @ KC, the last two picked
by hand). Every NFL break on S2, S3 and S4 fills with `TB @ CLE [DUPLICATE: only option]`, the game S1 already shows. At 18:54
S1, S2 and S3 all showed TB @ CLE at once. Duplicates are on by default (`director.allowDuplicates: true`), so with a thin
watchable slate the "RedZone" becomes three copies of one ballgame. For a multi-sport fan, three identical screens is worse than
three commercials: at least the commercials end on their own game. Suggest: at most one duplicate of a given game, or default
`allowDuplicates` to false, or prefer leaving the screen home.

### Fill-ins pick a baseball game that is itself between innings (high)
The same duplicates were chosen at "End 5th", "Mid 6th" and "Mid 7th" (log, e.g. `18:44:15 [S2] BREAK_FILL ... pick: TB @ CLE —
Other screen's sport (MLB): margin 3, End 5th`). Between innings is MLB's commercial (the README says median 147 s, never < 90 s),
so the fill-in swaps one commercial for another. It looks like MLB at Low treats between-innings as LIVE because Low doesn't
*switch away from* MLB for it, and the ranker reuses that assessment. "Is this game in a commercial right now?" (for choosing a
substitute) should not depend on the substitute sport's sensitivity.

### Held on a duplicate fill-in while the home NFL game ran its final drive (high)
`18:50:31 [S2] BREAK_FILL ARI @ LAR -> TB @ CLE` (ARI @ LAR 15-9, 4th, ~1:40 left, Rams driving), then
`18:50:39 [S2] HOLD_DWELL ... play resumed: Pass Reception ... to ARZ 1 for 5 yards ... home is back; 22s left on the substitute first`.
The home game came back 8 s after the switch with first-and-goal at the 1 in a one-score game, and the screen stayed on a
mid-inning baseball duplicate for 22 more seconds because of `minSubstituteSeconds`. The minimum time on a substitute should
never apply when the home game is in a hot moment (red zone, two-minute drill), and arguably never when the substitute is a
duplicate of another screen.

### Switching on a stale break call after dwell (medium)
`18:30:04 [S2] HOLD_DWELL ... BREAK? 0.50 ... 18s dwell left`, then `18:30:22 [S2] BREAK_FILL ... BREAK? 0.09 | Timeout: ~0:43
left (9% chance of 60s+)`. The switch happened when the forecast said only 9% chance of a 60 s break; the home game resumed 35 s
later. After the dwell runs out the director should re-check the threshold, not act on the earlier BREAK state.

### Odd forecast numbers: "Stoppage: ~10:53 left" / "~11:39 left" in the NFL 4th quarter (medium)
`18:48:19 [S4] ... Stoppage: ~10:53 left (77% chance of 60s+), quiet 186s` (a KC challenge) and `18:57:38 [S2] ... Stoppage:
~11:39 left (81%)` (ARI @ LAR, last minute). An 11-minute stoppage in the last minute of an NFL game isn't real, and that number
is what the user sees in the "why" line ("~10:33 left"). It looks like the long tail of the "ordinary play + long quiet" bucket.
Cap or hide the "left" estimate when it's this far out.

### Game-over auto-pick takes another sport's duplicate over a tied same-sport game (medium)
`19:02:34 [S2] AUTO_PICK GAME_OVER ARI @ LAR -> HOME TB @ CLE [DUPLICATE: only option]` while BUF @ LV was 23-23 in the 4th
(also on another screen, NFL, same sport). The pop-up lists "NFL · SAME SPORT" first, but the auto-pick then adopts the MLB
game, so S1 and S2 now share TB @ CLE as their *home* game permanently. An auto-pick should never make a duplicate home; leave
the screen on the final/picker (or a data tile) instead.

### Two game-over pickers at once in per-screen fullscreen (medium) - `05-game-over-picker-fullscreen.png`
With S2 fullscreen when its game ended, the overlay pop-up ("Best live game in 0:15", "Not now (stay here)") sits on top of the
in-screen picker page, which is still visible dimmed behind it with its own countdown ("0:13") and its own button ("Not now
(stay on this channel)"). Two countdowns that disagree and two differently worded buttons.

### An NHL intermission plays an 18-minute highlights reel while live games are on (high for me) - `09-nhl-intermission-reel-while-cfb-red-zone.png`
10/17 synth, S1 = BUF @ MTL (NHL Network): `19:50:29 [S1] HALFTIME ... (BUF 1-2 MTL End of 1st)` to `20:09:13 HALFTIME_OVER`, and
again 20:49 to 21:08. That's ~19 minutes each time of the reel ("highlight 1 of 32", clips of the game I'm watching), while 11
college football games were live and S2 showed UK @ OU at 3rd & goal from the 2. This is exactly the case I bought a
multi-sport RedZone for: a hockey intermission is the longest break of the night and should be filled with the best live game
(another sport), with the reel only when nothing is in play. At least make it a setting ("At halftime/intermission: live game
first / highlights").

### Cross-sport fill-ins land on games that just went to their own break (medium) - `10-nhl-whistle-filled-with-cfb-timeout.png`
`20:22:13 [S1] BREAK_FILL BUF @ MTL -> NEV @ NDSU ... Other screen's sport (CFB): margin 5, 1:03 - 2nd`. The fill-in tile's last
play is "Timeout North Dakota State, clock 01:03", so the hockey whistle break was filled with a football timeout. Same pattern
as the MLB between-innings fills above. A substitute whose last play is a timeout/end of period/between innings should be
skipped even before its own forecast crosses the threshold.

### Game over on an NHL screen turns it into a football screen (medium)
Earlier 10/17 synth run: `21:50:50 [S4] GAME_OVER BUF @ MTL ... 21:52:51 AUTO_PICK -> HOME ARK @ VAN (margin 7, 10:42 - 4th)`
while BOS @ LA (NHL, NESN, tied in the 1st) was live and not on a screen. I set that screen to NHL; the auto-pick should stay in
the screen's sport when there's a live, watchable game of it (the pop-up already lists "same sport" first). Same on 10/18:
S2's NFL screen auto-picked the MLB game, and `.state/settings.json` then saved `screenSports: ["mlb","mlb",...]`, so S2 is a
baseball screen on the next start too.

### "Use for all screens" silently does a partial job (medium)
10/17 synth 20:25, ticked "Use for all screens", picked NHL (11 games, 2 on my channels). Only S2 changed, and to BOS @ LA, which
**starts at 9:00 PM** (35 min away), replacing a live CFB game. S1 was already on the other NHL game; S3/S4 stayed on CFB with no
message. It should say "Only 2 NHL games are on your channels; S3 and S4 keep their games" and not swap a live game for one
that hasn't started.

### Tennis data tile shows sets only ("0 / 0", "WTA · 1st"), not the games (high for a tennis fan) - `08-tennis-tiles-vs-ticker.png`
At 23:05 on 10/19 the big ticker shows Jones 4-2 Li, Shuai 1-4 Valentova, Linette 3-1 Liu in set 1, but each screen's tile shows
two giant "0"s and a footer "WTA · 1st". The tile reuses the team-sport layout (name, short name, one big number) so for
tennis the big number is sets won, the current set's games are nowhere on the tile, there's no server dot, and "1st/3rd" should
read "Set 1/Set 3". The overlay header has it ("Jones 0–0 Li · Set 1 · 4–2"), the tile should match: per-set games, current
set big, server, tiebreak points when ESPN has them. The name row is also redundant ("Jones  E. Jones").

### Four tennis screens on one channel, no warning (medium) - `06-four-screens-same-tennis-channel.png`
On the Japan Open night all four matches are on Tennis Channel 838 (tagged COURTS VARY, header says "may show another court").
I could put one on each of the four screens; in real life that's four copies of the same Tennis Channel picture. The game list
should warn ("S1 is already on Tennis Channel: you'll see whatever court they show") or the sport-for-all pick should spread
across channels. The game-over pop-up (`07-tennis-game-over-picker.png`) also only offered matches on that same channel.

### "No other live game in play" when there are three (low)
`23:17:41 [S2] NO_CANDIDATE ... Set break ... no other live game in play; staying on home`, while Jones vs Li and Linette vs Liu
were live (on other screens and on the same channel). The reason is right (nothing useful to switch to) but the text is wrong;
say "the other live matches are on your other screens / this channel".

## What's confusing
- **Tennis uses football words (low).** A scheduled match reads "Sakatsume @ Boulter" in the screen header (the `@` comes from
  `screen.tsx` for any PRE game); the log uses "vs". A suspended match shows the orange `BREAK` badge (it should say SUSPENDED),
  and when its new start time passes with no data it shows `UNKNOWN`.
- **A tennis screen never fills itself (low).** Tour-level matches are COURTS VARY and "never picked automatically", so a screen
  whose remembered sport is WTA starts empty every time, with nothing on screen telling me why. A one-line hint in the empty
  screen ("tour matches are on Tennis Channel; pick one") would help.
- **Empty screens show internal view names (medium).** A screen with no game is black with grey "RZ-SCREEN-3" text (that's the
  view's title page). Nothing says "pick a game" until I hover. The log meanwhile says "No home games yet: pick them in the
  control panel (Alt+P)", a leftover from the Chrome-tiles era.
- **The game list opens on the remembered sport even when it has nothing (low).** On the tennis-only day, screen 1 (remembered
  MLB) opened straight into "MLB · 0 games / NO MLB GAMES TODAY" instead of the sport grid.
- **Unwatchable sports look available (medium).** On Sunday the sport grid says "NHL · 2 games · 1 live" and "MLS · 1 game · 1
  live", but every one of those is "streaming only: ESPN+ / Apple TV". The grid should say "1 live · none on your channels" so I
  don't pick NHL for a screen and find nothing I can watch. Clicking a greyed game does nothing at all, with no message.

- **Hockey and tennis inherit football/basketball words (low).** NHL intermissions are logged and listed as `HALFTIME` /
  "2nd half under way: BUF 1-2 MTL 20:00 - 2nd", and the reel's corner label says "Halftime highlights" while the badge says
  INTERMISSION. The Advanced → Recent switches list shows the raw log line (`HALFTIME_REEL highlights | home ... BREAK? 0.75`),
  which means nothing to a viewer.
- **Per-sport levels don't say what they do (medium).** Advanced → Per sport has Low/Medium/High for 14 sports with no hint
  that, for example, MLB at Low never switches between innings, tennis at Low only switches at set breaks, and soccer never
  switches during play. That's in the README table; one line under each sport in the app would make the choice obvious.
- **Sports chips in Settings (low).** "MCBB", "WCBB", "UCL", "LIGA" are abbreviations, and every chip looks the same whether
  on or off (all were on; state only in the tooltip, no `aria-pressed`).

- **README has stray control characters (low).** The install section contains `config<TAB>appedin.config.json5` and
  `scripts<BACKSPACE>uild-installer.ps1` (a `\t` and `\b` that got interpreted when the path was written), so those two paths
  render broken.

## Slow or clunky
- **Replays of `-live` days are mostly empty (medium).** `--replay 20261019-live` works as a value (good), but the recording
  only has 19:59-20:12 and 22:17-22:20 ET; the rest of the evening every screen shows `NO DATA`. The app could say "recording
  has no data until 22:17, skip ahead?" instead of an hour of NO DATA badges.
- **The big ticker leads with finals (low).** On Sunday evening the NFL section lists 9 finished 1 p.m. games before the NHL,
  MLB and MLS sections, so the live games of my other sports take a long scroll to reach. Live first, finals last (or a "hide
  finals after 30 min" switch) would suit a mixed slate. The mini ticker also kept showing old finals (`BAL 10–13 CLE · Final`).
- **Screen header crowding (low).** On a half-width screen in "SHOWING OTHER GAME", the "Back to my game" button sits on top of
  the lock / sound / fullscreen buttons (`10-nhl-whistle-filled-with-cfb-timeout.png`, top left). The "Live data (dry run)" chip
  also covers the start of the last-play line on every tile.
- **Fullscreen exit pill overlaps the ticker (low).** With the big ticker on and a screen fullscreen, "S2 · Exit" covers the
  last ticker card's score (`05-game-over-picker-fullscreen.png`). I also didn't find the lock toggle the README says appears in
  the top bar in per-screen fullscreen.

## What's missing
- **A way to say which sports may fill which screen (medium).** I'd happily let NFL fill an NHL intermission but never want
  baseball between innings filling my NFL screen. A per-screen "fill-ins from: same sport / any of my screens' sports / any"
  choice (or a per-sport "never use as a fill-in") would fix most of what I saw on 10/18.
- **"Watchable" counts in the sport grid (medium).** See above: "1 live" means nothing if it's ESPN+ only.
- **A replay day that matches the pitch.** For testing (and for a demo), a recorded or rebuilt day with NFL + NBA + NHL live at
  once. `fetch-day --sports all` for a November Sunday would do; nothing in the shipped recordings has it.

## New feature ideas
- **Sport-aware fill-in timing:** use what each sport's data says explicitly (NHL "TV Timeout", MLB end of half-inning, NFL
  two-minute warning, tennis set break) to time fill-ins so a 2:20 MLB inning break goes to a live NFL drive, and the screen
  comes back exactly when the inning starts.
- **Duplicate-aware layout:** when two screens would show the same channel (same game, or two tennis matches on Tennis
  Channel), offer "make this screen a big one" instead (merge into a 1+2 layout) rather than two identical pictures.
- **Tennis tile with a proper scoreboard:** set columns, current game points, server dot, tiebreak, and the "match point /
  set point" hot tag already in the ticker.
