# Backend review: ESPN data service (area `espn`)

Reviewer #1. Base: origin/main 3dce3ca. Scope: src/espn/**, src/highlights/**, ESPN parsing in src/sports/*.ts.
Evidence: every scoreboard record in recordings/ (all dates) put through normalizeScoreboard. Every status name,
phase and detail pattern seen maps sensibly. No parse errors, no missing team abbreviations, no missing start
times. The only recorded fetch errors are 3 network "fetch failed" lines (tennis, 10/19), and those were handled.

## 1. Highlight refresh requests tennis summaries that can't exist (medium): PR #10
- Evidence: src/highlights/service.ts:82 (doRefresh) fetches `summary?event=` for every live/final game. Tennis is
  `noSummary` (HTTP 400). Each failure takes one of 14 `maxGamesPerRefresh` slots and is never cached, so on a busy
  tennis day other sports' finals never get clips. LiveSource and record.ts already skip noSummary.
- Status: fixed. https://github.com/omcaul13/redzone/pull/10 (branch overnight/fix-highlights-tennis-summaries).

## 2. A failed highlight refresh crashes the app (medium): PR #19
- Evidence: service.ts:67 `refresh()` has only `.finally`, and both callers use `void` (app.ts:1023, service.ts reel()).
  YouTubeClient.save() (youtube.ts:119) writeFileSync is outside any try, so EBUSY/EPERM becomes an unhandled
  rejection and the Node process exits. The app has no unhandledRejection handler.
- Status: fixed. https://github.com/omcaul13/redzone/pull/19 (branch overnight/fix-highlights-refresh-rejection).
  It touches service.ts like PR #10, in a different hunk. git merge-tree shows the two merge cleanly.

## 3. LiveSource keeps every timer handle (low/medium): another agent's PR #14
- source.ts:284 sleep() pushes every setTimeout into `timers` forever. Another reviewer had already opened
  https://github.com/omcaul13/redzone/pull/14 (overnight/fix-livesource-timer-leak) with the same fix I planned.
  I didn't touch it.

## 4. Starting the app after midnight ET misses games still being played (medium): not fixed
- app.ts:266 `date: espnDateKey()` is taken once at startup. 20261017 had 7 CFB games live after 00:00 ET
  (UTAH@COLO, WAKE@CAL, UNM@HAW, FRES@SDSU...). Start the app at 00:30 ET and it polls 20261018, so none of
  them show up. The other half of the problem, no rollover during a long session, is documented as existing
  behavior in docs/superpowers/specs/2026-10-18-multi-sport.md:319.
- Why not fixed: it changes design/behavior. Recommendation: before about 06:00 ET, also poll the previous ET day
  (or use it as the date) until its live games are final, and roll the date over once yesterday is all final.

## 5. One failed scoreboard poll makes a live sport's games stale (low): not fixed
- source.ts:300/334: `base` starts at scoreboardIdleSeconds (60 s) and the catch path keeps it. After a failure
  (up to ~27 s of retries) the next poll is 60 s later, so data is ~100 s old. That's past staleDataSeconds (60),
  so every game of that sport turns UNKNOWN for about 40 s after a single blip.
- Why not fixed: it's polling cadence/tuning. Recommendation: after an error, retry at the live rate if the sport
  was live, and back off only after several failures in a row.

## 6. YouTube quota spent on tennis finals (low): not fixed
- service.ts:153 searches up to 8 finals per refresh, tennis included (the tennis module has no `highlights`).
  The default cap is 40 searches a day, and a tour week has dozens of finals, so tennis can use up the quota
  before other sports. Recommendation: search only for sports that define `highlights` (CFB counts too: no field but
  it's the default) or skip noSummary sports. This is a design call, so I left it.

## 7. Smaller items (low): not fixed
- LiveSource.stop() doesn't stop requests already in flight. A scoreboard response that arrives after stop (e.g. on
  entering setup) is still ingested into the engine (source.ts:320-323). Harmless today. A `stopped` check after
  the await would fix it.
- client.ts:75-81: response bodies of 429/5xx/4xx are never read or cancelled. undici frees them at GC. Adding
  `res.body?.cancel()` would be tidier.
- client.ts:78: a large Retry-After (e.g. 3600) sleeps inside getJson and stop() can't cancel it.
- recording.ts:152-157 / mergeByTime: on a gunzip error or an early `return` (replay `--to`), the file read
  stream is never destroyed. That leaks a file handle per replay/sim run.
- highlights/service.ts:140 compares Date.now() with summary `fetchedAt`. In replay those are replay-clock times,
  so replayed games always look stale and get refetched from ESPN while a reel shows (replay only).
- Suspended/delayed games stay DELAYED all day (tennis "Suspended" 10/19, MLB suspended). That keeps the sport at
  the live polling rate, and record.ts never finishes ("all games final" can't happen). It's by design but worth
  knowing.
- Hot play-by-play loop keeps polling a home game that went FINAL when there's no other game to auto-pick
  (relevantGameIds includes it), every 6 s while anything is live.
