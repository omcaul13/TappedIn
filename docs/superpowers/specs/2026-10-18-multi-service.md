# Multi-service RedZone: spec

Owner's brief (2026-10-18), condensed, plus the decisions approved after the Stage 1 research ([docs/research/streaming-services.md](../../research/streaming-services.md)).

## Goal

Let students at other schools, and people with consumer live-TV services, use RedZone Director. It must stay as easy as possible for a non-technical person to install and use.

## Stages and approval gates

1. **Research report.** Done and approved 2026-10-18.
2. **Provider-adapter architecture.** The owner approves the plan before any code is written.
   - Xfinity On Campus becomes the first adapter and must keep working exactly as now. The owner verifies it with their account before the work moves on.
   - Then experimental adapters, in priority order.
3. **Onboarding and multi-service UX.** Planned after Stage 2 lands.

## Stage 2 requirements

### The adapter interface

Each service is an adapter implementing a common interface:
- id, display name, a visual identity (no official logos, see decision 2), and status (stable or experimental).
- Login URL and a way to detect "logged in".
- Channel lineup discovery: scrape the service's guide where possible, with a manual mapping as fallback.
- `tune(view, channel)`: change a screen to a channel by the fastest method the service allows.
- Playing and error detection: not logged in, stream limit hit, channel not in plan, playback error.
- CSS injection that hides the service's UI so the video fills the view.
- Max simultaneous streams.

### Per-adapter JSON config

Every fragile site-specific detail lives in a per-adapter JSON config, never in code: URLs, CSS selectors, timing values, error text. That way a site change can be fixed without a code change.

### Xfinity On Campus regression bar

Same switching paths, timings, sign-in hand-off, standby views, health checks and messages.

### Adapters to build

Experimental adapters for: Xfinity Stream (consumer), Spectrum (SpectrumU and consumer Spectrum TV), Cox Contour (on Campus and consumer), YouTube TV, and Sling TV.

## Approved decisions (2026-10-18)

1. **Adapters:** the set listed above. Hulu + Live TV, Fubo, DIRECTV and Apogee Stream2 come later. Philo and DIRECTV campus are skipped.
2. **No official logos.** Use text names plus neutral initials or colors, and a non-affiliation disclaimer.
3. **Streams:**
   - Use whatever actually plays, and show the service's documented limit next to it.
   - Standby views (each one can be an extra stream) are off by default for other users.
   - The owner keeps their current 2 standby views.
4. **Source-only release.** Each user builds and EVS-signs their own copy, and the install path must make that as close to one step as possible.
5. **YouTube TV sign-in spike first.**
   - If Google blocks sign-in inside the app's view, the adapter is marked unsupported.
   - Never evade bot detection.

## Hard constraints (from CLAUDE.md and the research)

- **The engine stays pure.**
  - `src/engine/` keeps no I/O, wall-clock time or randomness.
  - Adapters live below the engine (window/driver layer).
- **Hands off DRM, credentials and streams.**
  - Never extract or redistribute streams, and never touch DRM.
  - Never type credentials or click a service's terms or activation consent.
  - Never call a site's private JavaScript functions, rewrite its network requests, or hook its internal app state. Tune only by URL navigation or by clicking the service's own guide.
  - Reading the page (DOM, URLs, the page's own network responses) is allowed.
- **Startup flags.** Electron args are `--name=value`.
- **Ask before running live.** Ask before running `npm start` (live streams) or `npm run sign-electron`.
- **Every config knob has a default.** It needs a zod schema and is documented.
