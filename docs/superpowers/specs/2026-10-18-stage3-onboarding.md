# Stage 3: onboarding, multi-service UX and installer (spec)

This is the owner's Stage 3 brief (2026-10-18), condensed, plus the constraints carried over from Stage 1 and Stage 2. The parent spec is [2026-10-18-multi-service.md](2026-10-18-multi-service.md).

## Goal

A student who has never used a terminal can download the source, double-click one file, pick their TV service, sign in, and watch. Getting there should take as few steps as possible.

## Requirements

### First-run flow (styled like the existing app)

1. **Welcome.**
   - Show a short non-affiliation and "your provider's terms apply" note.
   - Then choose a service from a list (text names and neutral initials, no official logos).
   - A search box matches school names to the campus service they use.
2. **Sign in** inside the app, on the service's real login page, including university SSO redirects.
   - The app never sees, stores or sends passwords.
   - Only the browser profile's normal session cookies persist, locally.
3. **Check the setup.**
   - Verify sign-in and playback on one channel.
   - Detect the channel lineup, and show which college-football networks the user has.
4. **Test simultaneous streams.**
   - Set the grid automatically (1, 2, 3 or 4 screens) from what actually plays.
   - Explain any limit in plain words.
5. **Done** → the main app.

### Settings

- A settings page to:
  - switch services
  - log out
  - re-run the lineup scan
  - edit channel mappings
  - re-run the stream test
  - turn standby views on or off
- The game dropdowns and the auto-switcher offer only games on networks the user's service and plan carry.

### Diagnostics (mainly for experimental adapters)

- Step through sign-in detection, lineup scan, tuning, playback detection and UI hiding, with pass/fail results.
- Let the user fix URLs and selectors from there.
- Export the working config to a file they can send to the owner.

### Installer (approved decision 4: source-only, as close to one step as possible)

- `Setup TappedIn.cmd`:
  - checks for Node and Python, and offers to install them (only with the user's yes);
  - installs dependencies;
  - runs castLabs' own EVS sign-up and signing;
  - checks everything;
  - adds Start-menu and desktop shortcuts, then opens the app into onboarding.
- `npm run doctor` checks the install and names a one-line fix for each problem.
- `Update TappedIn.cmd` updates the app and re-signs only when Electron changed.
- An antivirus HTTPS inspector must not break EVS signing (the Norton case in the README).

### Docs

- `CONTRIBUTING.md` explains how someone with a different service can test and fix an adapter.
- The README covers the supported services, their status and the setup steps.

## Constraints

- **Everything from Stage 2 still holds.**
  - Pure engine.
  - Tune only by URL or by clicking the service's own guide.
  - Never type credentials or click a terms or consent control.
  - Xfinity On Campus's Watch Now hand-off is the only auto-click.
  - Every config knob has a zod schema with a default.
  - Ask before `npm start` (live) or `npm run sign-electron`.
- **The owner's current setup keeps working with no onboarding.** That means Xfinity On Campus, 4 screens, 2 standby views, and the Northeastern lineup from the config file.
- **Diagnostics exports contain no cookies, no page text and no URL query strings or fragments.**
- **Windows only for now.** macOS is out of scope pending the owner's decision.
- **No new npm dependencies.**
  - The installer's private Python environment gets `castlabs-evs` and `truststore`, both pinned. `truststore` is new and needs the owner's approval.
  - Node or Python are installed only by winget, after the user agrees in the setup window.
