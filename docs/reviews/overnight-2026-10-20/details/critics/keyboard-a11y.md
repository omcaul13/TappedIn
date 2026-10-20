# TappedIn: keyboard and accessibility review (critic `keyboard-a11y`)

Who I am: a power user who works mostly from the keyboard. Some of the time I use a screen reader. I need to see where focus is, I prefer high contrast, and small text or cues that rely only on color give me trouble.

What I ran: onboarding with `--setup-demo` using only the keyboard, in headless Chrome against `/ui`. Then `--replay 20261017 --from 19:30 --speed 10` in the Electron window, driven over CDP with key presses only. I tested every documented key, read `ariaSnapshot()` of the UI and the halftime reel page, measured contrast from the CSS tokens, and checked computed animations with `prefers-reduced-motion: reduce` emulated. Screenshots are in this folder.

## What's good (short)

- **There's a real shortcut set, and most of it works.** 1–4 / 0 / Esc, Shift+1–4, M, T, S and F all behaved as documented. Esc closes an open menu or drawer first and then leaves fullscreen. The keys are listed in Settings → Advanced and in the README.
- **The browser's default focus ring is left alone on buttons.** On the opaque surfaces (onboarding cards, settings drawer, game menu) the white Chrome ring is clearly visible (`01-onboarding-focus-ring.png`).
- **In per-screen fullscreen, the hidden screens use `visibility: hidden`, so Tab skips them.** The top bar also gains a lock and an "Exit" button. That part is well done.
- **The search box ignores the single-letter shortcuts.** The global handler skips INPUT targets, so typing in a focused search box is safe (the problem is getting focus there; see below).
- **Onboarding's network list uses ✓/✗ glyphs, not just color,** and every step heading is a real `h2`.
- **Most body text has strong contrast:** `--text` on the panel is 16.4:1 and `--dim` is about 7.2:1.

## What's confusing

- **The screen buttons don't say which screen they belong to.** A screen reader hears four identical "Lock: stop automatic switching on this screen" buttons and four "Sound from this screen (mutes the others)". Nothing says screen 1, 2, 3 or 4: no region or landmark per screen, no screen number in the names. Only the fullscreen button says "(1)". The game button's accessible name is "NEV NEV 0–0 NDSU NDSU 2nd 15:00 · CBS Sports Network 856 ▼". The logo `alt` text repeats every abbreviation, the "▼" gets read aloud, and the useful "Choose this screen's game" is only in the `title`, so it is a description, not the name. **Severity: high.**
- **Game rows in the menu read as noise.** Example: "ND ND Notre Dame 0 BYU BYU BYU 0 1st 15:00 ABC 805". There's no "at", no "score", and abbreviations are doubled. The clean sentence ("Louisville Cardinals at Syracuse Orange · ACC Network 1325") is only in `title`. **Severity: medium.**
- **Selected or on/off state is shown only by styling.** Sensitivity Low/Medium/High, Sound "You pick / Follows the action", the ticker scope buttons, the onboarding "1/2/3/4 screens" picker, and the ticker toggle switches have no `aria-pressed`, `aria-checked` or `role="switch"`. A screen reader hears "Big ticker across the top, button" whether it is on or off. Visually, the selected segment's background is only **1.28:1** against the unselected one. The selected text turns white instead of dim, but that's subtle. The off state of the sport chips is `--faint` text, 3.6:1. **Severity: high** (I can't tell what my settings are).
- **Onboarding steps don't say which one is current.** The step pills are a list ("1 Service, 2 Sign in…") with no `aria-current`, and only color marks the current step. **Severity: low.**
- **The screen states rely heavily on color.** Red zone is shown only by a pulsing red outline on the screen (`.cell.rz`), with no text or tag. Sound-on is a green border plus a small icon. Possession in the big ticker is a small colored football. The text badges (BREAK, HALFTIME, OTHER GAME · LOCKED) are good. Red zone needs the same treatment. With real video there's no data tile to say "RED ZONE" (`05-…png`, screen 2). **Severity: medium.**
- **Replay keeps trying a real Xfinity sign-in.** It shows a red "Xfinity sign-in failed" chip for the rest of the replay (also "SIGN-IN FAILE", cut off, in the big ticker label), although replay never uses Xfinity. **Severity: low** (more under bugs).

## Slow or clunky

- **No "current screen" for keyboard users.** L and H act on "the screen under the mouse". With no mouse they do nothing, with no feedback at all, even when focus is on that screen's own buttons. In the grid, the only keyboard ways to lock a screen or send it home are Tab-hunting for an invisible button (next section) or going fullscreen first with 1–4. **Severity: high.**
- **Long Tab paths and no arrow keys.** From the page start it takes 15 Tabs to reach the first control of the open Settings drawer, because focus isn't moved into it and it comes last in the DOM. The game list is Tab-only: ArrowDown/ArrowUp do nothing, and with 23 CFB games plus the other sports grouped below, that's a lot of Tabs. Opening the menu leaves focus on the game button, and the next three Tabs go to that screen's lock, sound and fullscreen buttons before reaching "← Sports" and the search box. **Severity: medium.**
- **The big ticker can't be used from the keyboard.** Cards are `<div onClick>` with no tabindex, so "click a game to put it on a screen" is mouse-only. Space (pause) and ←/→ (speed) only work while the mouse is over the ticker (`motion.current.hover`). The mini ticker is a `<span onClick>`, also mouse-only. **Severity: medium.**
- **The big ticker's content is read twice, as one block.** The accessibility tree has the whole slate as one long text run, and it appears twice because of the copy that keeps the scroll seamless (`r7`: "CFB 15 LIVE · 52 TROY 6 UL 33 END OF 4TH …" ×2). Only the label block has real structure. The duplicate copy should be `aria-hidden`. **Severity: medium.**
- **The halftime reel and in-screen pages can't be reached or controlled.** The reel is a separate view: its only focusable element is a `<video>` without controls or captions (`textTracks: 0`). There's no keyboard way to skip a clip, pause, or leave the reel for your game, since H needs the mouse. **Severity: medium.**

## Doesn't work as intended (bugs: steps to reproduce)

1. **Overlay buttons stay focusable while invisible.** **Severity: high.** `03-focus-on-invisible-fullscreen-button.png`
   - Replay, grid view, mouse still. Press Tab.
   - After the three top-bar icons, focus moves through every screen's game button, Back to my game, lock, sound and fullscreen buttons, all at **opacity 0**. `.ov.hidden .head` uses `opacity: 0; pointer-events: none`, and visibility depends only on hover, a recent change or an open menu, never on `:focus-within`.
   - Pressing Enter on what looks like nothing fullscreens the screen (this happened to me). The overlay should show while it contains focus, or the buttons should be removed from the tab order while it is hidden.
2. **Typing in the game search fires global shortcuts.** **Severity: high.**
   - Tab to a screen's game button and press Enter (or Space). The menu opens but focus stays on the button: the input's `autoFocus` doesn't take effect.
   - Type "LSU" to search. "S" opens Settings, "L" tries to lock, and nothing is searched.
   - Any team name with t, m, f, h, l, s or a digit toggles the big ticker, mutes, goes window-fullscreen, sends a screen home, or fullscreens a screen.
   - Fix: focus the input when the menu opens, and have the global handler ignore keys while a menu is open.
3. **Focus is lost on every view change.** **Severity: high** for screen-reader users.
   - Esc on the game menu, picking a game, the ← Sports button, every onboarding step change ("Get started", choosing a service, sign-in → channels → playback → streams), "Start watching", and Settings → Advanced / Manage all leave `document.activeElement` = BODY.
   - Esc should return focus to the button that opened the menu. A new step should move focus to its `h2` or its first control.
   - In onboarding I also had to press Tab once on the welcome page before "Get started" was focused.
4. **The S and T keys work during first-run setup.** **Severity: medium.** `02-S-key-opens-settings-during-setup.png`
   - In `--setup-demo`, press S: the Settings drawer opens on top of setup, partly covered by setup's own layer (cut off at the screen-2 cell).
   - Press T twice: `.state/settings.json` got `"ticker": {"big": false}` written during onboarding.
   - Keys should be off while `st.setup` is set, except Esc and Tab.
5. **Settings drawer isn't a dialog and doesn't hold focus.** **Severity: medium.**
   - It is an `<aside>` (role complementary). Focus isn't moved into it on open, and Tab walks straight out of it into the dimmed screens behind the scrim.
   - The mouse can't reach the content behind the scrim, but the keyboard can, so I was lock-toggling screens I couldn't see.
   - The close and back buttons are named "close" and "back" (lowercase, fine), but nothing announces "Settings dialog".
6. **Replay is blocked for 10 minutes by a real sign-in window.** **Severity: high** (it blocks the documented "data tiles" mode).
   - Run `--replay 20261017 --from 19:30` with no Xfinity session (fresh LOCALAPPDATA).
   - The shell opens xfinityoncampus.com/login in a window and `shell.ready` waits for it. The engine doesn't start and every screen sits at "PICK A GAME" until `waitForUserMs` (600000 ms) runs out ("Xfinity did not open after the Xfinity On Campus hand-off"). Then the replay starts.
   - For a keyboard user, a sign-in window that grabs focus at startup is also a trap. Replay and dry run should start the shell with `--signin=defer`.
7. **The disabled "4 screens" option hides its reason.** **Severity: low.** In onboarding the reason ("Your plan played 3 at once") is only in the `title` of a disabled button. Disabled buttons can't be focused, so keyboard and screen-reader users never get it. Greyed game rows have the same problem: the "not in lineup: …" reason is in the title of a disabled row. On-screen the row shows the network or the unavailable text, but it's dimmed to opacity .38, so 2.0:1 for the small text.
8. **Halftime: the screen tag covers the reel's caption.** **Severity: low.** `04-halftime-tag-covers-caption.png` In the bottom-left, the "Halftime highlights" tag sits on top of the clip caption: "AJ Bianco finds the end zone…" became "…Halftime highlights end zone for 15-yard TD". The same happens with the "Live data (dry run)" tag over the data tile's last-play line (`03-…png`, bottom-left of screen 1).
9. **Squashed header buttons.** **Severity: low.** With a long game name plus "Back to my game", the lock, sound and fullscreen buttons on screens 1 and 2 shrank to **17 px wide** (measured; normally 30 px). That's a hard target to see a focus ring on, and also to click.

## What's missing

- **Nothing announces auto-switching.** **Severity: high.** There is no `aria-live` or `role="status"`/`"alert"` anywhere in `src/ui`. A screen-reader user isn't told about "Switching to UTAH @ COLO", "Back to your game", halftime reels, the game-over picker and its countdown ("Best live game in 2:00", then it picks without asking), stream problems, the toast errors, or sign-in state. One polite live region per screen ("Screen 2: switched to UTAH @ COLO, ND @ BYU timeout") plus an assertive one for the game-over countdown and errors would cover it. A screen reader should also get the "why" line, which today is only there while the overlay is visible.
- **The game-over picker isn't treated as a dialog.** **Severity: medium.** `05-gameover-picker-and-redzone-outline.png`
  - Measured on screen 4 ("Final: ND 24-28 BYU. Pick the next game"): focus didn't move to the picker and nothing was announced.
  - It took **17 Tabs** from the page start to reach its first row. Esc left it open with the auto-pick still counting down. There's no shortcut for "Not now (stay here)".
  - The 120 s countdown (40 s at replay ×3) can easily run out before a keyboard or screen-reader user gets there.
  - The data tile behind it draws a second picker with its own countdown, one second off (1:46 vs 1:45), which looks like a ghost.
- **Most motion ignores `prefers-reduced-motion`.** **Severity: medium.** With reduce emulated, these all still run: the red-zone pulse (`rz`, infinite), the LIVE dot blink (`blink`, infinite), spinners, the switching-card fade, the drawer slide-in, the big ticker's LIVE dot (`bt-pulse`), the score flash (`bt-scored`, infinite alternate) and the big ticker's continuous scroll, which is driven by requestAnimationFrame with no reduce check. Only the mini ticker's slide-in is turned off. When reduce is set, the ticker should be still by default (paused, or pages that change on a timer).
- **Small text and faint colors.** **Severity: medium.**
  - Body text is 13 px. Section headings (`h5` SWITCHING, SOUND…, menu "LIVE NOW", game-over sport headings) are 10.5 px in `--faint` #656b88: **3.6–3.7:1**. That fails WCAG AA's 4.5:1 for small text. So does the onboarding fine print (`.fine`, 11.5 px, 3.6:1).
  - The HALFTIME (white on blue, **3.95:1**), STREAM PROBLEM (4.05:1) and OTHER GAME (4.24:1) badges are 11 px and fall just under 4.5:1.
  - The big-ticker label text is about 0.56 em of a 96 px bar, and it gets cut off ("SAT OCT 17 · MY SPO…", `06-big-ticker-truncated-label.png`).
  - There's no text-size or zoom setting. Ctrl+= isn't offered, and the global handler ignores Ctrl, so maybe Electron's own zoom works, but nothing mentions it.
- **Focus visibility is weak in places.** **Severity: medium.**
  - The search inputs set `outline: none` and show focus only with a 1 px border at 2.7:1 (below the 3:1 non-text minimum).
  - In the Electron window the default ring rendered at 0.8 px. It's fine on opaque panels, but the overlay buttons float over video, where a thin ring disappears.
  - A custom `:focus-visible` style (2 px, offset, light plus dark double ring) would fix all of these at once.
- **No high-contrast or forced-colors support.** **Severity: low.** There are no `@media (forced-colors: active)` rules. Toggle switches and segment selection are drawn with backgrounds, which Windows High Contrast removes, so the on/off state would vanish.
- **No in-app shortcut help.** **Severity: low.** The key list is only at the bottom of Settings → Advanced. A "?" key (or a hint in the top bar) would help. The shortcuts also aren't exposed on their buttons (no `aria-keyshortcuts`), though the titles do mention them ("Settings (S)").

## New feature ideas

- **Keyboard "screen focus":** have Tab/F6 or Ctrl+1–4 select a screen and show its overlay while it's selected. Then L, H, Shift+number and the game menu act on that screen with no mouse. This one change fixes the hover-only overlay, L/H, and the invisible buttons.
- **A "G" key** opens the current screen's game menu with the search already focused, and ↑/↓ moves through the list (a listbox, or roving tabindex).
- **An accessibility section in Settings:** larger text (scale the UI), high-contrast colors, reduce motion (on by default when the OS asks), "announce switches" (screen reader verbosity: off / switches only / everything), and a longer game-over countdown or "never auto-pick".
- **Sound cue option:** a short chime or spoken line when a screen switches, so I don't have to watch all four screens to notice a change.
- **A text-only "what's on" summary** (a key or a panel) that reads out each screen's game, score, state and why, for screen-reader use.
