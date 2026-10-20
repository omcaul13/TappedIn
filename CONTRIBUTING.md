# Testing and fixing a TV service

TappedIn drives each TV service's own web player. Websites change, and most services here were built without a real account to test with (they're marked **Experimental**). If you have one of them, you can test it, fix it, and send the fix back so it works for everyone. No coding needed.

## 1. Test your service

1. Install TappedIn (double-click `Setup TappedIn.cmd`, see the README) and pick your service in setup.
2. If setup gets stuck at any step (sign-in, channels, playback), press **Diagnostics**. You can also open it later from **Settings → TV service → Diagnostics**.
3. Run the five steps in order:

| Step | What it checks |
|---|---|
| Sign-in detection | TappedIn can tell you're signed in |
| Channel guide | It can read the guide and find the college-football networks |
| Tuning | It can put screen 1 on a channel |
| Playback | The video plays |
| Full-screen video | The service's menus are hidden and the video fills the screen |

Each step shows **pass** or **fail** and what it saw.

## 2. Fix what fails

When a step fails, the settings it depends on appear right under it. They're the same values as in `config/providers/<service>.json`:

| Setting | What it is | Example |
|---|---|---|
| `signin.checkUrl` | A page that shows the service when you're signed in | `https://watch.spectrum.net/guide` |
| `signin.signedOutPattern` | Text that only appears when you're signed out (a regular expression; `/…/` keeps upper and lower case exact) | `/\bSign In\b/` |
| `shell.appUrl` | Matches every page of the service's player (regex) | `^https://watch\.spectrum\.net/` |
| `shell.playerUrl` | Matches the page that's playing a channel (regex) | `/livetv` |
| `tuning.lineup.row` | A CSS selector for one channel row in the guide | `li.channel-header-row` |
| `tuning.lineup.ref.*` | Where the channel's id is inside that row: an element, an attribute, and a pattern whose first `( )` group is the id | `img.channel-logo`, `src`, `/guide/(\d+)\?` |
| `tuning.watchUrl` | The address of a channel; `{ref}` is replaced by its id | `https://watch.spectrum.net/livetv?tmsid={ref}` |
| `tuning.refInUrl` | Finds the id in the player's address, to check where a tune landed | `[?&]tmsid=(\d+)` |
| `shell.hideCss` | Extra CSS to hide anything still covering the video | `.player-controls { display: none !important }` |

**Tip:** to find a selector, open the service in Chrome, right-click a channel in the guide, choose **Inspect**, and look at the element's tag, class and attributes.

**Saving.** Change a value and press **Save & retry**, then run the step again.
- TappedIn checks every fix before saving it. A value that wouldn't work (a broken pattern, a wrong type) is refused, with the reason.
- Your fixes are stored in `.state/providers/<service>.json` on your computer. They sit on top of the built-in file, so updates to TappedIn don't erase them.
- **Edit all fixes as JSON** shows the whole fix file, for bigger changes.

## 3. Send the fix

Press **Export config**. TappedIn writes `tappedin-<service>-<date>.json` to `Documents\TappedIn` and opens the folder.

- **What it contains:** your fixes, each step's pass or fail, and what each step saw.
- **What it never contains:** your password, cookies, page text, or the parts of web addresses after `?` or `#` (that's where sign-in codes live).

Open the file in Notepad before sending if you'd like to check. Then attach it to an issue on the project's GitHub page, or send it to the project owner.

## Testing without the full app

For people comfortable with a terminal, this signs in, reads the guide, saves what it found, and tunes two channels, reporting each with a screenshot when something doesn't play:

```bash
npm run provider-check -- spectrum-tv --scan --save --tune ESPN,FS1
```

Replace `spectrum-tv` with your service's id (the file name in `config/providers/`). The screenshots go in `.state/provider-check/`.

## Adding a new service

**Start from the closest existing file in `config/providers/` and copy it to a new id.** There are two families:

- **`comcast`:** Comcast's TV-APP player (Xfinity, Cox). Channels change by clicking the guide; the lineup comes from the channel map the guide downloads.
- **`url`:** services with an address per channel (Spectrum, YouTube TV, Sling). The lineup comes either from the guide page (`lineup.mode: "dom"`) or from the guide data the page downloads while you scroll (`lineup.mode: "response"`).

Set `status` to `"experimental"` and `defaults.standbyViews` to `0`, and give it its own `shell.partition`, so each service keeps its own sign-in. Use initials and a neutral colour for `badge`, never the service's logo. Then run `npm test`: every shipped config is checked.

**Ground rules** (they're what keep TappedIn on the right side of the services' rules and the law):

- TappedIn only does what you could do yourself in the service's player: load channel addresses, click its guide and its own buttons.
  - Never call the website's hidden JavaScript functions.
  - Never change or replay its network requests.
  - Never reach into its app state.
  - Reading the page, and the data the page itself downloads, is fine.
- Never type passwords, and never click a terms, consent or activation button. The only button TappedIn presses on its own is Xfinity On Campus's **Watch Now**.
- Never get around a stream limit, a home-network or location check, or a "this browser isn't supported" or bot check. If a service blocks TappedIn, mark it `"unsupported"` with the reason in `notes`.
- Nothing leaves the user's computer except what the service and ESPN's public scores need. No servers, no proxies, no telemetry.

## Code changes

For anything beyond a config fix, see `CLAUDE.md` for how the app fits together. Then:
- Run `npm test` and `npm run typecheck`.
- Run `npm run sim -- --day 20261017 --compare` before and after any change to switching. Its results shouldn't change unless switching is what you meant to change.
