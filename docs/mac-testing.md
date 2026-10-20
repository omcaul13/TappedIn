# Testing TappedIn on a real Mac

CI already checks some things on every Mac build (`release-mac.yml`):
- the app is universal: the main executable, `runtime/node` and esbuild each have arm64 and x86_64
- `codesign --verify --deep --strict` passes
- the castLabs VMP signature (tagged releases)
- the app starts and loads its settings from Application Support, on Apple Silicon and under Rosetta

CI can't check video, sign-in, Gatekeeper, the look or real updates. This list is for those. Tick each box; for anything that fails, note the macOS version, the Mac (Apple Silicon or Intel), what you did, and the logs listed at the end.

**Setup:** a Mac on macOS 12 or later, ideally one Apple Silicon and one Intel. Download a tagged release's `TappedIn.dmg` (from the website or the GitHub release) with a browser, so it carries the same quarantine flag as a user's download.

## 1. Install from the .dmg (Mode A)
- [ ] The .dmg opens a window with TappedIn and an Applications folder.
- [ ] Drag TappedIn to Applications; Finder shows the TappedIn icon (not Electron's).
- [ ] Eject the disk image.

## 2. Getting past the security prompt (Mode A only; delete this section once the app is signed)
- [ ] Open TappedIn from Applications. macOS 15 (Sequoia) and later say it can't verify that TappedIn is free of malware. Click **Done** (not Move to Trash).
- [ ] **System Settings → Privacy & Security**, scroll to **Security**: "TappedIn was blocked to protect your Mac." Click **Open Anyway**, then authenticate (password or Touch ID).
- [ ] Open TappedIn again and click **Open** in the dialog that follows. It starts.
- [ ] On macOS 14 or earlier: Control-click TappedIn in Applications → **Open** → **Open** works too.
- [ ] Quit and reopen: no prompt the second time.
- [ ] If macOS says TappedIn "is damaged and can't be opened", the signature is broken. That's a build bug, so report it (don't work around it with `xattr`).

## 3. First run: setup and sign-in, for each service
The window opens maximized and the menu bar says **TappedIn**. Setup starts.

For each service you can test (Xfinity On Campus is the supported one; the others are experimental): Xfinity On Campus, Xfinity Stream, Cox Contour, Cox Contour on Campus, Spectrum TV, SpectrumU, Sling TV, YouTube TV, Apogee Stream2:
- [ ] Choose the service; the sign-in window appears.
- [ ] Typing works, and **⌘V pastes** (the Edit menu makes this work), including into the password field.
- [ ] Sign in yourself (TappedIn never types credentials). School SSO pop-ups open and close normally.
- [ ] Setup finishes: channel scan, play test, stream test.

Then **Settings → TV service → switch service** works, and so does **Sign out**.

## 4. Widevine playback
- [ ] One screen plays live video with sound. If you see a license error such as `-9000`, the VMP signature or the entitlements are wrong; report it.
- [ ] 2, 3 and 4 screens play at once (up to your plan's stream limit; TappedIn shows the limit).
- [ ] Standby views on (Settings → standby): switching back to a screen's game is instant.
- [ ] After 30+ minutes, video is still playing on every screen.

## 5. Switching
- [ ] During a long commercial break, a screen switches to another live game, and back when the break ends.
- [ ] At halftime or an intermission, the highlights reel plays; after a final, the game picker appears.
- [ ] Locking a screen (L) stops its switching; H goes back to its home game.
- [ ] Without video: `TappedIn.app/Contents/MacOS/Electron --replay 20261017 --from 19:30 --speed 10` from Terminal (only if that recording exists in `~/Library/Application Support/TappedIn/recordings`). Data tiles switch as on Windows.

## 6. Window, title bar and full screen
- [ ] The traffic lights (close/minimize/zoom) sit centered in the top bar's left end and don't cover the TappedIn logo, the clock or the mini ticker.
- [ ] With the **big ticker** on (T), the traffic lights sit left of the ticker's label block and cover nothing.
- [ ] The top bar drags the window, and double-clicking it zooms the window like any Mac app.
- [ ] **Native full screen**: the green button, **⌃⌘F**, **F**, the toolbar's full-screen button and **View → Toggle Full Screen** each go to full screen in its own Space, and each one leaves it again.
- [ ] In native full screen, the top bar and big ticker move left (no gap where the traffic lights were); moving the mouse to the top shows the menu bar.
- [ ] **Per-screen full screen** (1–4, or double-click a screen) works in and out of native full screen. **Esc** leaves per-screen full screen first, then native full screen.
- [ ] Swiping between Spaces with TappedIn full screen keeps every stream playing.
- [ ] Closing the window (red button or ⌘W) quits TappedIn.

## 7. Tickers
- [ ] The mini ticker scrolls in the top bar; clicking it opens its menu.
- [ ] The big ticker: on/off (T), pause and speed (Space, ←, → over it), height from Settings.
- [ ] A hot-moment alert appears and clears.

## 8. Keyboard shortcuts
- [ ] 1–4 fullscreen a screen, 0 back to the grid; Shift+1–4 moves the sound; M mutes; L, H, S, T and F work.
- [ ] **⌘,** opens Settings, **⌘Q** quits, **⌘H** hides, **⌘M** minimizes, **⌘R** reloads the controls (video keeps playing).
- [ ] Settings → **Keyboard shortcuts** shows ⌃⌘F (not F11) and ⌘, next to S.
- [ ] Typing in the game search box doesn't trigger shortcuts.

## 9. Menu bar
- [ ] **TappedIn → About TappedIn** shows the version (e.g. 0.1.0-beta.2).
- [ ] **TappedIn → Settings…** opens the settings drawer.
- [ ] Hide, Hide Others and Quit work.
- [ ] Edit: cut, copy, paste and select all work in text fields.
- [ ] View: Reload Controls and Toggle Full Screen.
- [ ] Window: Minimize and Zoom.
- [ ] Help: TappedIn Website and Install Guide open in your browser, and Report a Problem opens a mail draft.

## 10. Retina / display
- [ ] On the built-in Retina display, the text, icons, tickers and grid lines are sharp (not blurry or doubled).
- [ ] Moving the window to a non-Retina external display, and back, keeps things sharp and the grid laid out.
- [ ] After resizing the window, the video views fill their cells exactly.

## 11. Quit, relaunch, data
- [ ] Change a few settings (sensitivity, sound mode, ticker), quit with ⌘Q, reopen: they're kept, and you're still signed in.
- [ ] `~/Library/Application Support/TappedIn` has `.state`, `logs` and `electron`, and nothing is written inside TappedIn.app.
- [ ] The Dock shows one TappedIn icon while it runs, and it goes away after quitting. Activity Monitor shows no leftover TappedIn or node processes.
- [ ] Opening TappedIn from Finder while it's already running doesn't start a second copy. (Known: it doesn't bring the window forward either; click the Dock icon instead.)
- [ ] Settings → Diagnostics → export: the file lands in `~/Documents/TappedIn`, and "Show" reveals it in Finder.

## 12. Updating
**Mode A (notice):**
- [ ] Install an older release, publish a newer one (or run with an older version against the live site). About 30 seconds after start, "TappedIn x.y is available" appears.
- [ ] **Download** opens `/download/mac`, and installing the new .dmg over the old app keeps your settings.

**Mode B (automatic), once signed:**
- [ ] The update downloads in the background, then "TappedIn x.y is ready" appears. **Restart Now** relaunches into the new version with settings kept.
- [ ] **Later**, then quit: the next launch is the new version.

## 13. Intel Mac
- [ ] Repeat 1, 4 (one and four screens), 6 and 11 on an Intel Mac.

## Logs to send with a failure
- `~/Library/Application Support/TappedIn/logs/launcher.log` (start-up)
- `~/Library/Application Support/TappedIn/logs/decisions-<date>.jsonl` (switching)
- **Settings → Diagnostics → Export** (it has no cookies, page text or URL queries)
- macOS version, the Mac model (Apple menu → About This Mac) and the TappedIn version
