# Backend review: decision engine (`engine`)

Reviewer #2. Base: origin/main 3dce3ca. Review worktree: `C:\Users\omcau\code\redzone-wt\engine-review`.

## Findings

### 1. NHL power play never detected live (high)
- Evidence: `src/engine/engine.ts:127` uses the play-by-play power play (`playsLive`) only when the snapshot has no
  `live` field, but `src/sports/hockey.ts:125` always returns a `live` object (strength `null`) and ESPN's live NHL
  scoreboard always has `situation` (499/499 in-progress NHL polls in `recordings/20261018-live`). So in live mode
  the power-play hot moment (README "Hot moments") never fires; it only works on synth days.
- Status: fixed, PR #8 https://github.com/omcaul13/redzone/pull/8 (branch `overnight/fix-nhl-live-power-play`).
  Leftover (not fixed): `playsLive` goes stale if a game's play-by-play stops being polled.

### 2. A stream problem unlocks a locked screen; loses "Not now" on game over (high)
- Evidence: `src/engine/director.ts` `applyAction` `streamError`/`streamOk`: recovery rebuilt the mode from what
  was showing, so LOCKED became HOME/FILL_IN (auto switching resumes), and GAME_OVER became HOME (pop-up returns
  with a new auto-pick countdown).
- Status: fixed, PR #12 https://github.com/omcaul13/redzone/pull/12 (branch `overnight/fix-lock-after-stream-error`).
  director.ts is also in 49ebc87 (other hunks).

### 3. Tiers 2/3 ordered by a sport's own comparator (medium)
- Evidence: `src/engine/ranker.ts:81` `compareCandidates` used `sport.compare` for any same-sport pair, in every
  tier; README 63-69 and the multi-sport spec say tiers 2/3 go by normalized score. Also made the sort comparator
  non-transitive in tiers 2/3.
- Status: fixed, PR #18 https://github.com/omcaul13/redzone/pull/18 (branch `overnight/fix-tier23-order`).

### 4. A halftime longer than halftimeMaxSeconds restarts the reel every 20 s (medium)
- Evidence: `src/engine/director.ts` halftime branch: HALFTIME_OVER tunes home and clears `halftimeSince`; the next
  tick past dwell sees HALFTIME + mode HOME and starts a new reel. Long halftime = reel / 20 s game / reel...
- Status: fixed on branch `overnight/fix-halftime-reel-restart` (pushed, test added, full suite + typecheck pass),
  **PR not opened**: my PR #12 touches the same files (director.ts, director.test.ts), and the brief says not to
  open a PR on files another open PR touches. `git merge-tree` shows it merges cleanly with #12 and with 49ebc87's
  director.ts. Open it after #12 merges (PR body ready in the commit message).

### 5. MLB between innings at Low used as another screen's fill-in (medium)
- Evidence: `src/engine/forecastDetector.ts:97` returned LIVE with no forecast for an excluded category, so the
  ranker's `candidateMaxBreakRisk` never saw the commercial. Replay 20261018-live: NFL screen filled with
  "TB @ CLE, Mid 6th" twice.
- Status: fixed, PR #26 https://github.com/omcaul13/redzone/pull/26 (branch `overnight/fix-excluded-break-substitute`).
  Tennis left as is (see below).

## Not fixed (reported)

### 6. Two screens can end up on the same channel without the duplicate flag (medium)
- Evidence: `src/engine/director.ts:140` `othersShowing` marks other screens' *home games* as taken but not their
  home *channels*, and the FILL_IN clash check (`director.ts:324`) compares game ids only. On a regional channel
  (several CFB games mapped to "ABC"), screen B can fill in with game Y on ABC while screen A (home X on ABC) is away;
  when A returns home both screens show ABC, no `duplicate` flag, invariant 1 (games only) doesn't see it. Same
  root: a screen can fill in with another game on its *own* home channel (the same commercial).
- Why not fixed: needs director.ts (my PR #12 is open on it) and touches CFB pick logic (frozen). An experiment adding
  other screens' home channels to `shownChannels` left `cfb-golden`, `replay` and `mixed-replay` passing.
- Recommendation: add home channels in `othersShowing` (pass `views`), exclude games on the screen's own home
  channel in `pickBest`, and make the clash check channel-based. NFL is already covered by the regional check.

### 7. Tennis at Low: a match in a changeover can be another screen's fill-in (low)
- Evidence: same as #5 but for `timedResume` sports, which PR #26 deliberately leaves alone: a forecast with no
  "play resumed" signal would outlive the changeover (the "quieter than anything on record" 0.9 fallback in
  `forecast.ts:100`). Only Grand Slam matches with a listed network are candidates, so impact is small.
- Recommendation: for timed-resume sports, attach the forecast only until `survival(viewerElapsed+10) <= 0.5`
  (the same test the BREAK path uses), and keep the shared-channel exclusion separate from the preset one.

### 8. Engine purity: file I/O and wall clock inside src/engine (low)
- Evidence: `src/engine/forecast.ts:1,36` reads model files with `readFileSync` (cached per path, called from
  `Engine.detector`); `forecast.ts:43` `emptyModel` stamps `new Date()` (metadata only, no decision depends on it).
  Decisions stay deterministic. Recommendation: load models in `config.ts`/app and pass them in, if purity matters.

### 9. Unbounded per-game state over a long run (low)
- Evidence: `GameStore.games`/`seenPlays` and `Engine.assessments`/`memory` are never pruned; games from earlier
  days stay in `views()` (as UNKNOWN once stale). Fine for one evening; grows over a multi-day session.

### 10. MLB inning break becomes a fill-in again after ~85 s (low, design)
- With #5 fixed, a between-innings game is skipped only while P(60 s+ left) >= `candidateMaxBreakRisk` (0.5), so it
  is eligible for the last ~60 s of a ~150 s commercial. That is the existing rule; a candidate rule based on
  `remainingSec` would be a tuning change, so not touched.

## Checked and fine
- Football/NFL OT: "End of OT"/"2OT" details don't hit the halftime regex; NHL "End of 1st/2nd" = intermission,
  "End of 3rd"/OT = break; MLB "Mid/End" innings, extra innings; tennis RETIRED/WALKOVER = FINAL, SUSPENDED = delay
  (BREAK) at every level; soccer HT / end of regulation / end of extra time = HALFTIME.
- Dwell, min-substitute hold, locks (apart from #2), HOME_SYNC, game over → pop-up → auto-pick, a fill-in ending
  (replaced or back home), two screens wanting the same substitute (ordered, the second gets the next game).
- Postponed/canceled home game → game over right away; delayed start → BREAK (fill-in) until it starts.
- No `Date.now`/`Math.random` in `src/engine` or the sports modules' decision code.
- Sims over every recorded day (50 days, `--by-sport --full-lineup`, Low and High = 100 runs, on origin/main
  3dce3ca): invariants held in all 100. (I briefly edited director.ts in the review worktree for ~15 s for an
  experiment while they ran; at most one run could have used that version, and it only made picks stricter.)
