# TappedIn

A multi-game "red zone" channel for college football, the NFL, college and pro basketball, the NHL, MLB, soccer and tennis, on the TV service you already have. One app window shows up to four channels in a grid, each screen on its own sport. A director watches ESPN's live game data and changes each screen's channel:

- **Long commercial break on a screen's game:** the screen fills in with the best live game: the same sport first (red zone, power play, clutch time…), then a sport another screen is watching, then any sport.
- **Play resumes:** the screen goes back to its game.
- **Halftime (or a hockey intermission):** the screen plays a highlights reel, same sport first.
- **Game ends:** a game picker appears in that screen.

TappedIn plays your service's own web player in castLabs' Widevine-licensed Electron and changes channels the way you would: by its channel addresses or by clicking its guide.
- It never extracts or redistributes streams and never touches DRM.
- You sign in on the service's real page. TappedIn never sees, stores or sends your password.
- Everything runs on your computer. Nothing is sent anywhere except to your TV service and ESPN's public scores.

TappedIn isn't affiliated with or endorsed by any TV service, school, league or network, and each service's terms of use apply to your account.

| Version | What | Status |
|---|---|---|
| v0.0.1 | Chrome tiles: data service, director, window control, control panel, halftime reel | ✅ done (live-tested 10/17) |
| v0.0.2 | **One app window** (Electron) with per-screen overlays, settings drawer, team colors and logos | ✅ done (live-tested 10/17) |
| v0.0.3 | **Faster switching:** standby views, in-window switching card, faster play-by-play for on-screen games | ✅ done (live-tested 10/17) |
| v0.0.4 | **Switch less:** break forecast from 76 recorded games, Low/Medium/High sensitivity, hysteresis | ✅ done (replayed 10/10 and 10/17) |
| v0.0.5 | **Other TV services:** provider adapters with per-service config files | ✅ Xfinity re-verified live 10/18 through the adapter; full app check on a game day pending |
| v0.0.6 | **Setup for everyone:** one-click installer, first-run setup, TV service settings, diagnostics | ✅ setup run live on Xfinity On Campus 10/18 (sign-in, scan 17 networks, playback, 4 streams); installer checked in check-only mode |
| v0.0.7 | **Multi-sport:** sport modules (NFL, men's and women's college basketball, NBA, WNBA, NHL, MLB, MLS, Premier League, Champions League, La Liga), sport picker, 3-tier fill-ins | ✅ built and tested on recorded and rebuilt days (10/18); college football unchanged (identical decisions on its recorded days); not yet watched live with streams |
| v0.0.8 | **Tennis** (ATP, WTA), **per-screen fullscreen**, the **big ticker** (the CFB ticker, built in, every sport) and the **mini ticker** | ✅ built and tested on recorded data and replays (10/19); not yet watched live with streams |
| v0.0.9 | **TappedIn:** renamed from RedZone, one-download Windows installer (TappedIn-Setup.exe), new look | ✅ merged (PRs #4–#7); first installer build is v0.1.0 |

## Supported sports

Each sport is a module in `src/sports/` with its own ESPN feed, break detector (built from that sport's measured stoppages) and excitement scorer. The numbers below are measured on recorded or rebuilt days (`npm run sim -- --by-sport`, Low sensitivity, every game watchable except college football's 10/10 row): switches per screen-hour, "false" switches (the home game resumed within 45 s), and long breaks (90 s+) the screen spent elsewhere.

| Sport | Status | Switches at Low for… | Never on its own | Halftime / reel | Hot moments | Measured |
|---|---|---|---|---|---|---|
| **College football** | ✅ unchanged | ends of quarters, kickoffs after scores, injuries; timeouts and possession changes after quiet | incompletions, out of bounds, penalties | halftime | red zone | 15.5/h, 14% false, 80% caught (10/10, Boston lineup) |
| **NFL** | ✅ | ends of quarters, **two-minute warning** (96% ≥ 90 s), scores (the NFL takes the commercial after the score), injuries; timeouts after quiet | incompletions, penalties | halftime | red zone, two-minute drill in a one-score game, OT | 14.5/h, 12% false, 66% caught (10/11) |
| **Men's college basketball** | ✅ | **official TV timeouts** (under 16/12/8/4, 96% ≥ 90 s); short and team timeouts after quiet | fouls, free throws, baskets | halftime | crunch time (≤ 6 pts, last 4:00), OT | 13.7/h, 2% false, 78% caught (2/21, 148 games) |
| **NBA** | ✅ | full timeouts (incl. the mandatory TV ones, 97% ≥ 90 s), ends of quarters | fouls, baskets | halftime | clutch time (≤ 5 pts, last 5:00), OT | 10.8–13.3/h, 2–10% false, 74–78% caught (3/11, 3/12) |
| **NHL** | ✅ | **TV timeouts** (every one ≥ 90 s), end of regulation; penalties and goals after quiet | icing, offside, goalie freezes | 1st/2nd intermissions | power play, one-goal game in the last 2:30, OT/shootout | 10.8/h, 6–11% false, 68–74% caught (10/13, 10/17) |
| **MLB** | ✅ | (Low: nothing; your call) Medium/High: **between innings** (median 147 s, never < 90 s) | pitches, new batters | — (rain delay = delay) | no-hitter through 6+, extra innings, bases loaded, runners in scoring position late | Medium: 13.1/h, 2% false, 75% caught (8/15) |
| **Women's college basketball** | ✅ | official TV timeouts (under 5:00 of each quarter), ends of quarters | fouls, baskets | halftime | crunch time, OT | 11.8/h, 3% false, 71% caught (2/22) |
| **WNBA** | ✅ (14 recorded games: thin data) | official and full timeouts, ends of quarters | fouls, baskets | halftime | clutch time, OT | tested on recorded games only |
| **Tennis:** ATP, WTA (singles) | ✅ (rules-based model: ESPN has no tennis play-by-play) | (Low: set breaks, 120 s) Medium/High: also **changeovers** (90 s) caught with 60 s / 45 s left; suspensions and rain delays at every level | points, the change of ends after game 1, tiebreak end changes, a changeover while another match is live on the same channel | — (no reel; the game-over pop-up at the end) | match point, set point, break point (when ESPN has points), tiebreak, deciding set, an upset brewing | rules-based model; tested on scripted and recorded matches (10/19) |
| **Soccer:** MLS, Premier League, Champions League, La Liga | ✅ | nothing during play (no commercials while the ball is in play); weather delays only. Soccer games are good fill-ins for other sports | everything during play | halftime, the break before extra time | level or one-goal game from 75', stoppage time, extra time, shootout | never switched during play on 10/17 (EPL, La Liga) and 9/8 (UCL) games; MLS games filled other sports' breaks at tier 3 |

What ESPN's data can and can't tell (and how the app copes):
- **TV timeouts are explicit** in college basketball (`OfficialTVTimeOut`), the WNBA (`Official Timeout`) and the NHL (a `Stoppage` play "TV Timeout"). Football's aren't, so football still reads them from the quiet after a play.
- **Pulled goalies aren't marked** in NHL data (only "Empty Net" goals), so the late hot moment is "a one-goal game in the last 2:30", when teams pull the goalie.
- **NFL Sunday afternoons:** ESPN labels every CBS/FOX game "national", but your local station airs one of the 3–4 in each window. In a multi-game window only your market's team (`sports.market`, default Boston) is picked automatically; the others show **REGIONAL** in the game list and can still be picked by hand. (Reading the TV guide's program title to confirm the others is wired in, `Engine.setProgramTitles`, but no service adapter reads titles yet.)
- **Soccer:** most MLS games stream on Apple TV and many Premier League and Champions League games on Peacock or Paramount+; only the ones on cable networks (USA, NBC, CBS, FOX/FS1, ESPN, Telemundo/Universo, Univision/TUDN) are offered.
- **Tennis:** ESPN's tennis scoreboard lists tournaments (Grand Slams flagged), rounds, courts, seeds and games per set, but there is **no play-by-play** (no summary at all), so breaks are read from games and sets ending between polls, and a break ends on a timer (the rule times: 90 s changeover, 120 s set break) instead of on "play resumed". **Medical timeouts aren't in the data.** TV networks are listed only at the Grand Slams (ESPN, ESPN2…); tour-level matches are assumed to be on Tennis Channel (`sports.tennis.assumedNetwork`), shown as **COURTS VARY** and never picked automatically. A channel shows one court at a time: of several live matches on one channel, the **feature match** (a listed broadcast, then the main show court, then the best seeds) is the one the app counts on; the others are COURTS VARY, and their changeovers don't switch (the producer usually cuts to another court). World rankings come from ESPN's rankings, once a day. Every poll returns the whole draw (1.8 MB at a Slam), so only today's singles are kept and recorded.
- **Most NBA (and many NHL/MLB) games air only on regional sports networks.** Games on networks your lineup doesn't carry are greyed out with the reason ("not in lineup: NBC Sports Philadelphia", "no network listed").

## Choosing sports

- **Each screen's game list starts with a sport:** a grid of sports with today's game count ("12 games · 4 live"); sports with no games today are greyed. Pick one, then a game. Below that sport's games, the other sports follow, grouped.
- **Use for all screens:** tick it before picking a sport and every screen switches to its own game of that sport (the best ones nobody else is showing, like the startup pick). Locked screens keep their game. Change any screen afterward.
- **Each screen's header** shows the sport (glyph + "NHL") next to the score and state badge. A screen remembers its sport for the next start.
- **The "why" line** on a fill-in names the tier: `Showing UTAH 7–0 COLO · Same sport: red zone, 2:10 - 4th · ND @ BYU: timeout · ~1:49 left`, or `Other screen's sport (CFB): …`, or `Other sport (NBA): clutch time, 4th 1:30`.
- **Game over:** the pop-up lists the same sport first, then the other sports, grouped.

### How a screen picks a fill-in

When a screen's home game goes to a long break (by that sport's own detector), the replacement is, strictly in this order:
1. **Same sport:** another live, in-play game of the same sport, by that sport's order (football: red zone, then closest, then later; others: hot moment, then the 0–100 excitement score).
2. **A sport another screen is watching**, by the normalized excitement score.
3. **Any other sport** the app follows, by the normalized excitement score.
4. **Nothing in play:** stay on the home game (or, with `director.allowDuplicates`, a game another screen shows, flagged, as the last resort).

The usual rules still hold: no game on two screens unless it's the only option, the dwell time, locked screens never switch, back home when the home game shows a new play, halftime/intermission reels. The normalized score is `100 × closeness × (0.35 + 0.65 × lateness) + a hot-moment bonus (+ overtime)`, with closeness scaled per sport (football 17 points, basketball 15, hockey 3 goals, baseball 5 runs), so a one-goal third period ranks near a one-score fourth quarter. Every decision logs its tier (invariant 6 checks that no fill-in skipped a better tier).


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

1. Download **`TappedIn-Setup-<version>.exe`** from the [Releases](../../releases) page.
2. Run it and click through: pick the folder (default `%LOCALAPPDATA%\Programs\TappedIn`, no admin rights needed), choose whether you want a desktop shortcut, and leave **Launch TappedIn** ticked on the last page.
   - Windows may say "Windows protected your PC" because the installer isn't code-signed with a paid certificate: click **More info** → **Run anyway**.
   - Everything is included (its own Node and the video player, already signed for Widevine). You don't need Node, Python or a castLabs account.
3. The first start opens **setup**: pick your service, sign in, and TappedIn checks your channels and how many streams your plan plays at once (about two minutes).

To update, run a newer `TappedIn-Setup` the same way; your settings and sign-ins are kept. Uninstall from Windows Settings → Apps (it keeps the `.state` folder with your settings). If you edited `config	appedin.config.json5`, an update saves your copy as `tappedin.config.json5.bak` next to it.

**From source instead** (the zip or `git clone`): double-click **`Setup TappedIn.cmd`**. It installs Node.js and Python (only if you type **Y**), installs TappedIn's parts, walks you through castLabs' free EVS sign-up to sign the video player, checks everything, and adds Start menu and desktop shortcuts. Run **`Update TappedIn.cmd`** to update; it re-signs the player only when it changed. `npm run doctor` checks an install and says how to fix anything wrong.

**Building the installer** (maintainers): `powershell -ExecutionPolicy Bypass -File scriptsuild-installer.ps1` (needs [Inno Setup 6](https://jrsoftware.org/isdl.php) and a signed checkout or a saved EVS login; `-Unsigned` makes a test build where video won't play). Pushing a `v*` tag builds a signed installer in GitHub Actions and attaches it to that release; it needs the `EVS_ACCOUNT_NAME` and `EVS_PASSWD` repo secrets. Keep the tag in step with `version` in package.json, which names the file.

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

**Norton or another antivirus "web shield":** if Python reports `CERTIFICATE_VERIFY_FAILED`, the antivirus is re-signing HTTPS. The setup file handles this by having Python trust Windows' certificate store (the `truststore` package). By hand, point Python at a certificate bundle that includes the antivirus root: set `$env:AWS_CA_BUNDLE` and `$env:REQUESTS_CA_BUNDLE` to `%LOCALAPPDATA%\TappedIn\ca-bundle.pem`, which is Python's `certifi` bundle plus the antivirus root exported from Windows' certificate store.

</details>

## First-run setup

`npm start` (or the TappedIn shortcut) opens setup the first time, and again whenever you switch services:

1. **Welcome**, then **pick your service.**
   - Campus TV comes with your housing.
   - The search box also finds your school ("Northeastern" → Xfinity On Campus).
2. **Sign in** on the service's own page, in a window TappedIn opens.
   - School sign-in (SSO, Duo) works there as usual.
   - Accepting a service's terms (such as Xfinity's Terms of Activation) is your call; TappedIn never clicks them.
   - Only the browser's normal session cookies are kept, on this computer, separately for each service.
3. **Channels.** TappedIn reads the service's guide and shows which college-football networks you get. Games on networks you don't get are greyed out and never picked.
4. **Playback.** One channel plays on screen 1.
5. **Streams.**
   - TappedIn adds screens one at a time until one won't play.
   - Then it sizes the grid (1, 2, 3 or 4 screens) and explains any limit, e.g. "Your plan played 2 streams at once (Xfinity documents 1). TappedIn will use 2 screens."

Xfinity On Campus signs itself in at every later start. Its On Campus sign-in persists, and TappedIn presses the **Watch Now** button on your On Campus page in a hidden window, exactly what you'd click. Xfinity rejects Electron's browser identifier ("update your browser"), so the app presents the matching Chrome identifier.

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

**Sharing the fix.** **Export config** writes your fixes and the results to `Documents\TappedIn`. The file has no passwords, cookies or page text, and addresses are cut to the site and page. Send it in so everyone gets the fix ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Running it

```bash
npm start
```

One TappedIn window opens maximized: a slim top bar and your screens (four, or what setup found your plan plays) edge to edge. **F11** toggles full screen. It picks four watchable home games to start; change them from each screen's game list. Close the window (or Ctrl+C in the terminal) to stop.

| Mode | Command | What you see |
|---|---|---|
| Live | `npm start` | Xfinity video in each screen, switched by the director |
| Dry run | `npm start -- --dry-run` | Today's real ESPN data, but **live data tiles** instead of video (uses no streams) |
| Replay | `npm start -- --replay 20261017 --from 19:30 --speed 10` | A recorded night, sped up, on data tiles. Add `--synth` for a day fetched with `fetch-day` |
| Chrome tiles | `npm run start:chrome` | The original four Chrome windows + control panel (fallback) |

Other options: `--homes id1,id2,id3,id4`, `--no-auto` (start with no home games), `--audio auto`, `--no-record` (by default live mode also records ESPN data to `recordings/<date>-live/`).

### The window

**Top bar** (kept minimal): live game count, the clock with the **mini ticker** next to it, and three buttons: the big ticker, settings, full screen. A chip appears while signing in to Xfinity, and REPLAY / DRY RUN in those modes. Switch sensitivity and sound are in Settings.

**Each screen** has an overlay that appears when you move the mouse over it and hides after 3 seconds without movement (it also flashes for a few seconds when the screen changes):
- **Game list** (click the game at top left, marked with its sport's icon): today's games with logos, score or kickoff, and network. Games you can't watch (not in your lineup, ESPN+, Peacock…) are greyed out. Search by team or network. Picking a game makes it this screen's game.
- **State badge**, only when something's unusual (a plain live game shows none): `BREAK`, `HALFTIME`, `FINAL`, `SHOWING OTHER GAME`, `STARTS 8:00 PM`, or `STREAM PROBLEM`.
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

**Per-screen fullscreen:** the ⤢ button in a screen's header, a double-click on the screen, or **1–4** makes that screen fill the window. Its overlay, switching card, game-over pop-up and halftime reel all work as usual, and it keeps switching on its own. The other screens keep playing behind it, muted and hidden, and keep switching and tracking their games, so going back is instant. Sound follows the fullscreen screen and goes back to what it was when you leave. The top bar shows a **lock** toggle and **Screen 2 · Exit**; **Esc**, **0**, the same button or a double-click go back to the grid. Nothing reloads: the window only resizes and re-stacks the video views (the log says `layout: … none reloaded`). **F11** (or **F**) is the whole-monitor full screen, and works together with it.

**Tickers** (one data model for both, fed by the app's own ESPN data: no extra polling of their own):
- **Big ticker** (**T**, the ticker button, or Settings → Tickers): the CFB ticker from `launch-ticker.ps1`, built in: the same navy bar, gold rule, logos, ranks, possession football (red in the red zone), gold flash on a score and UPSET on finals; it scrolls when the games don't fit and pauses on hover (**Space** pauses, **←/→** set the speed). It sits across the very top and covers the top bar; the clock, live count and status move into its label block, and the ticker, settings and full screen buttons (and Exit/lock in per-screen fullscreen) into its right column under the window buttons. The screens move down below it (resized, not reloaded). Now every sport, grouped by sport: quarters, periods, innings, minutes, sets; down & distance and the red zone, power plays, bonus, the count and runners on base (RISP), tennis set scores, points, the server and break/set/match point. Click a game to put it on a screen.
- **Mini ticker** next to the clock: one game at a time on one line (`NHL · BOS 2–1 TOR · 3rd 4:12 · PP BOS`), sliding to the next every 5 s (Settings → Tickers). A score or a new hot moment (touchdown, goal, red zone, match point…) in a game it covers makes it jump there for a few seconds. It's on by default and hides while the big ticker is on, so there's never two at once; it stays in the top bar in per-screen fullscreen.
- **What they show:** the games on your screens, every game of the sports you follow, or every sport (sports you don't follow are then polled at the idle rate, for the ticker only). The mini ticker can follow the big one's choice or have its own; college football can be limited to top-25 games. All of it is saved in `.state/settings.json`.

**Settings** (gear, or **S**) has two pages:
- **Basic:** switching (Low / Medium / High), sound (you pick, or it follows the action), the sports you follow, the two tickers and what they show, and your TV service (**Manage ›** opens its page: channels, streams, re-scan, diagnostics).
- **Advanced** (the link at the bottom, for the picky): each sport's own level, dwell time, time on a substitute, a game on two screens, ESPN polling rates, ticker fine-tuning (the mini ticker's own choice, CFB top 25 only, rotation time, big ticker height and speed), YouTube status, recent switches, the keys, and **Reset to the config file**.

Changes apply at once and are saved in `.state/settings.json`, which wins over the config file until that reset.

**Keys:** **1–4** fullscreen that screen · **0** or **Esc** back to the grid (Esc closes an open menu first) · **Shift+1–4** sound from that screen · **M** mute all · **L** lock/unlock the screen under the mouse (or the fullscreen one) · **H** that screen back to its game · **T** big ticker · **S** settings · **F** / **F11** full screen.

## Switch sensitivity: only long breaks

Settings → Switching (Low / Medium / High) applies to every sport, each with its own numbers (Settings → Advanced → **Per sport** sets a sport's own level; Settings → Sports turns a sport off). This section is college football's; other sports' rules are in [Supported sports](#supported-sports).

There's no "commercial" flag in football's data feed, so the app forecasts how long the stoppage after the latest play will last, from **real stoppages in 76 recorded games** (10/10 and 10/17/2026, `config/break-models/cfb.json`; `npm run build-break-model -- --sport cfb` rebuilds it). Other sports' models are built the same way from their own recorded games (`config/break-models/<sport>.json`).

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

Everything you might tune lives in **`config/tappedin.config.json5`**: the lineup, switching sensitivity and presets, the sports to follow and per-sport tweaks (`sports`), polling rates, dwell time, standby views and audio. Every value is commented. Anything you leave out falls back to the default in `src/config.ts`. Most sections hot-reload.

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
| `npm run fetch-day -- 20261010` then `npm run sim -- --day 20261010 --synth` | Rebuilds **any past day** from final play-by-play and simulates it. `--sports nhl,nba` (or `all`) fetches other sports; mixed days work |
| `npm run sim -- --day 20261017 --synth --by-sport [--screen-sports nhl,cfb,cfb,cfb] [--full-lineup] [--no-regional]` | Per home sport: switches, time away, suspected false switches, long breaks caught, fills by tier. `--full-lineup` treats every game as watchable (to judge a sport's detector on a full slate) |
| `npm run build-break-model [-- --sport nhl]` | Rebuilds each sport's break forecast from every recorded game (college football's only when named) |
| `npm run build-tennis-model` | Writes tennis's rules-based break models (`config/break-models/{atp,wta}.json`) |
| `npm run switch-stats -- [--since 22:52]` | Switch timing per stage and path |
| `npm run analyze-log` | Detector vs your labels, switching stats |
| `npm run record [-- --sports all\|cfb,nhl]` | Records a game day's ESPN data for every followed sport to `recordings/<date>/` (each record names its sport). Tennis (`--sports atp,wta`) can only be recorded live: ESPN keeps no tennis play-by-play for `fetch-day` |
| `npm run espn:probe` | Today's slate, networks, and whether you can watch each game |
| `npm run sign-electron` | castLabs EVS signing (see Install) |
| `npx tsx scripts/shell-check.ts` | Starts the app window alone and prints everything it says |

The old control panel still works at <http://localhost:7480/panel>.

## Project layout

```text
config/tappedin.config.json5   the one editable file
config/providers/<id>.json    one per TV service: URLs, selectors, timings, error text, sign-in rules
config/schools.json           school → campus TV service, for setup's search
config/break-models/<sport>.json  stoppage-length model per sport (npm run build-break-model)
electron/main.cjs             app window: frameless window, video views + standby views, UI layer, sign-in;
                              configure/logout/sign-in check requests from the app
electron/layout.cjs           where each screen sits for 1-4 screens (the UI mirrors it)
electron/ui-preload.cjs       the UI's only shell access: full screen
src/app.ts                    the app: ESPN data -> engine -> window controller, UI state + API, settings, labels
src/shell.ts                  starts the app window and finds its views over the local debugging port
src/ui/                       the window's UI (Preact, bundled on the fly by esbuild): top bar, screen overlays,
                              game list, switching card, game-over panel, settings drawer, setup, diagnostics
src/providers/                TV service adapters (comcast: guide clicks; url: an address per channel), registry,
                              lineup and network matching
src/setup/                    first-run setup steps, setup state, diagnostics, export, channel mapping
src/sports/                   one module per sport (cfb, nfl, leagues.ts: mcbb/nba/wcbb/wnba, hockey, baseball) on
                              family code (football, basketball); markets (NFL regional windows); synth/ per family
src/engine/                   gameStore, forecast + forecastDetector (switch less), breakDetector (classic),
                              ranker (3 tiers), director, audio, engine, invariants
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

## Adding a sport

1. **Get data.** `npm run fetch-day -- <date> --sports <id>` for a few past days (add the league to `fetch-day`'s list by registering the module first, step 2), and `npm run record` on a live day.
2. **Write the module** in `src/sports/` (copy the closest family: `basketball.ts` + `leagues.ts` for a clock sport, `hockey.ts`, `baseball.ts`, `football.ts`). It implements `SportModule` (`src/sports/types.ts`):
   - `espn`: the league path (`basketball/nba`).
   - Parsing: `phaseOf` (which period end is halftime/intermission), `situationOf`, `summaryPlays`, `classifyPlay`; optional `inferFirstSeen`/`inferChange` (what a scoreboard change implies) and `liveFromPlays`.
   - `breaks`: stoppage `categories` and `categorize` (what kind of stoppage a play starts), `resumes` (play kinds that end a break), `ignore` (bookkeeping plays), `modelFile`.
   - `presets`: Low/Medium/High numbers (`excludeCategories` keeps a stoppage from ever switching at a level).
   - Excitement: `excitement` (0–100 score, hot moment, why) and `compare` (same-sport order); `progressSeconds`.
   - `synth` (to replay past days) and `highlights` (YouTube search words and channels).
   - Optional, for a sport ESPN shapes differently (tennis uses all of them): `scoreboardEvents` (games nested some other way), `snapshotExtra` (fields of its own on every snapshot), `trimScoreboard` (what to record), `noSummary` (no play-by-play to poll), and in `breaks`, `timedResume` (a break ends when its forecast runs out) and `sharedChannelExclude` (categories that don't count while another live game is on the same channel).
   List it in `src/sports/index.ts` and add its id to `SportId` (`src/engine/types.ts`).
3. **Build its model:** `npm run build-break-model -- --sport <id>` prints each category's P(≥ 60/90/120 s).
4. **Networks:** add the league's networks (ESPN's names, guide names, call signs) to `NETWORKS` in `src/providers/networks.ts`; the next start adds them to your lineup from the saved scan.
5. **Test it:** a fixture of a few recorded games in `test/fixtures/sports/<id>/` and a `test/sports/<id>.test.ts` like the others (`breakStarts` replays a game through the real engine); then `npm run sim -- --day <date> --synth --by-sport --full-lineup --screen-sports <id>,<id>,<id>,<id>` and tune the presets.

## Findings worth knowing (10/17/2026)

- **Electron (castLabs ECS 44.5.1, signed with EVS):** Xfinity plays with the Chrome identifier. Four channels in one window played at 960×540, 60 fps, with CPU at about 26%. Six simultaneous streams played with no limit message.
- **Overlays:** a transparent view draws cleanly over the protected video. Hiding Xfinity's interface while the player is up leaves just the picture.
- **Xfinity pages loading at the same moment** in one browser session can all end up on the same channel, so loads go one at a time.
- **Stream delay:** the picture runs about 30 s behind real time and ESPN data about 25 s. A snap ESPN logged at 18:56:19 appeared on screen at about 18:56:49.
