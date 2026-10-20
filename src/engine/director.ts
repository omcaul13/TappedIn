import type { DirectorConfig } from '../config';
import { sportOf } from '../sports';
import { describeGame, rankCandidates, tierLabel, type GameView, type RankedCandidate, type Tier } from './ranker';
import type { SportId } from './types';

// The director: one small state machine per screen. Pure: (state, game views, time) in →
// (new state, commands for the window controller, logged decisions) out.
//
// Rules (per screen):
//  - Home game in play → show it.
//  - Home game in a break → best live game elsewhere: same sport first (red zone first …), then a
//    sport another screen is watching, then any sport; back home when play resumes.
//  - Home game at halftime → highlights reel; back home when the 2nd half starts.
//  - Home game over → game-over pop-up; after gameOverAutoPickSeconds adopt the best live game.
//  - LOCKED screens never change on their own. Every automatic switch respects dwellSeconds.

export type ScreenMode = 'IDLE' | 'HOME' | 'FILL_IN' | 'HALFTIME_REEL' | 'GAME_OVER' | 'LOCKED' | 'ERROR';

export type Showing = { kind: 'none' } | { kind: 'game'; gameId: string; channel: number } | { kind: 'halftime' };

export interface ScreenState {
  id: number;
  homeGameId: string | null;
  mode: ScreenMode;
  showing: Showing;
  lastSwitchAt: number;
  halftimeSince: number | null;
  gameOver: { since: number; autoPickAt: number | null } | null;
  /** `mode`: what the screen was doing before the problem (a lock or game-over pop-up survives it). */
  error: { detail: string; since: number; mode?: ScreenMode } | null;
  /** Last "waiting" note logged (dwell / no candidate), so it's logged once, not every tick. */
  lastNote: string | null;
}

export interface DirectorState {
  screens: ScreenState[];
}

export type Command =
  | { type: 'tune'; screen: number; gameId: string; channel: number; channelName: string }
  | { type: 'showHalftime'; screen: number; homeGameId: string }
  | { type: 'showGameOver'; screen: number; gameId: string; autoPickAt: number | null }
  | { type: 'hideGameOver'; screen: number };

export type Rule =
  | 'HOME_SYNC'
  | 'BREAK_FILL'
  | 'RETURN_HOME'
  | 'FILL_REPLACE'
  | 'FILL_UPGRADE'
  | 'HALFTIME'
  | 'HALFTIME_OVER'
  | 'GAME_OVER'
  | 'AUTO_PICK'
  | 'HOLD_DWELL'
  | 'NO_CANDIDATE'
  | 'USER_SET_HOME'
  | 'USER_LOCK'
  | 'USER_UNLOCK'
  | 'USER_FORCE'
  | 'USER_HOME'
  | 'USER_SKIP'
  | 'USER_KEEP'
  | 'USER_REJECTED'
  | 'STREAM_ERROR'
  | 'STREAM_RECOVERED';

export interface Decision {
  at: number;
  screen: number;
  rule: Rule;
  /** True when the screen's picture actually changes (a switch). */
  switched: boolean;
  /** True for automatic decisions (subject to dwell); false for your commands. */
  auto: boolean;
  from: string;
  to: string;
  reasons: string[];
  /** Top candidates considered, best first. */
  candidates?: string[];
  /** The pick was already on another screen (allowed only when nothing else was available). */
  duplicate?: boolean;
  gameId?: string;
  /** Fill-in tier: 1 same sport, 2 a sport another screen is watching, 3 any other sport. */
  tier?: Tier;
}

export type UserAction =
  | { type: 'setHome'; screen: number; gameId: string }
  | { type: 'lock'; screen: number }
  | { type: 'unlock'; screen: number }
  | { type: 'force'; screen: number; gameId: string }
  | { type: 'goHome'; screen: number }
  /** "Force a switch": jump to the best other game now and lock there until you send it home. */
  | { type: 'skip'; screen: number }
  /** Game-over pop-up "Not now": stop the auto-pick countdown and stay on this channel. */
  | { type: 'cancelAutoPick'; screen: number }
  | { type: 'streamError'; screen: number; detail: string }
  | { type: 'streamOk'; screen: number };

export interface StepResult {
  state: DirectorState;
  commands: Command[];
  decisions: Decision[];
}

export function createDirector(screenCount = 4): DirectorState {
  return {
    screens: Array.from({ length: screenCount }, (_, i) => ({
      id: i + 1,
      homeGameId: null,
      mode: 'IDLE' as ScreenMode,
      showing: { kind: 'none' } as Showing,
      lastSwitchAt: Number.NEGATIVE_INFINITY,
      halftimeSince: null,
      gameOver: null,
      error: null,
      lastNote: null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers

function label(views: Map<string, GameView>, showing: Showing, mode?: ScreenMode): string {
  const prefix = mode ? `${mode} ` : '';
  if (showing.kind === 'none') return `${prefix}(nothing)`;
  if (showing.kind === 'halftime') return `${prefix}highlights`;
  return `${prefix}${views.get(showing.gameId)?.game.shortName ?? showing.gameId}`;
}

function shownGameId(sc: ScreenState): string | null {
  return sc.showing.kind === 'game' ? sc.showing.gameId : null;
}

/**
 * Games/channels "taken" by other screens: whatever they show now, plus their home games (a screen
 * will return to its home as soon as it's back in play, so fill-ins steer clear of it).
 */
function othersShowing(screens: ScreenState[], self: number): { games: Set<string>; channels: Set<number> } {
  const games = new Set<string>();
  const channels = new Set<number>();
  for (const sc of screens) {
    if (sc.id === self) continue;
    if (sc.homeGameId && sc.mode !== 'GAME_OVER') games.add(sc.homeGameId);
    if (sc.showing.kind !== 'game') continue;
    games.add(sc.showing.gameId);
    channels.add(sc.showing.channel);
  }
  return { games, channels };
}

function shownOnOtherScreen(screens: ScreenState[], self: number, gameId: string): boolean {
  return screens.some((s) => s.id !== self && s.showing.kind === 'game' && s.showing.gameId === gameId);
}

/** The sport of a screen's home game. */
export function screenSport(sc: ScreenState, views: Map<string, GameView>): SportId | undefined {
  return sc.homeGameId ? views.get(sc.homeGameId)?.game.sport : undefined;
}

/** Sports the other screens are watching (their home games'). */
export function otherScreenSports(screens: ScreenState[], self: number, views: Map<string, GameView>): Set<SportId> {
  const out = new Set<SportId>();
  for (const sc of screens) {
    if (sc.id === self) continue;
    const sp = screenSport(sc, views);
    if (sp) out.add(sp);
  }
  return out;
}

export function pickBest(screens: ScreenState[], sc: ScreenState, views: Map<string, GameView>, extraExclude: string[] = [], maxBreakRisk?: number): { best: RankedCandidate | null; ranked: RankedCandidate[]; duplicate: boolean } {
  const shown = othersShowing(screens, sc.id);
  const exclude = new Set([...(sc.homeGameId ? [sc.homeGameId] : []), ...extraExclude]);
  const { ranked, duplicateFallback } = rankCandidates(views.values(), { exclude, shownGames: shown.games, shownChannels: shown.channels, maxBreakRisk, homeSport: screenSport(sc, views), otherSports: otherScreenSports(screens, sc.id, views) });
  return { best: ranked[0] ?? null, ranked, duplicate: duplicateFallback };
}

const topList = (ranked: RankedCandidate[]) => ranked.slice(0, 3).map((c) => `${c.view.game.shortName} (${c.why})`);
/** "pick: UTAH @ COLO — Same sport: red zone, margin 7, 2:10 - 4th". */
const pickReason = (c: RankedCandidate) => `pick: ${c.view.game.shortName} — ${tierLabel(c)}: ${c.why}`;

// ---------------------------------------------------------------------------------------------
// Automatic step

/** Director knobs; the two optional ones come from the switching settings (absent = original behaviour). */
export type DirectorStepConfig = DirectorConfig & {
  /** Minimum time on a substitute before going back home. */
  minSubstituteSeconds?: number;
  /** Replace a substitute that goes to break only if home still has this much break predicted. */
  replaceIfHomeRemainingSeconds?: number;
  /** Skip substitutes whose own break forecast is at or above this. */
  candidateMaxBreakRisk?: number;
  /** Per home sport, the sensitivity-dependent knobs above (absent = the top-level values). */
  perSport?: Partial<Record<SportId, { replaceIfHomeRemainingSeconds: number; upgradeFillInToRedZone: boolean; halftimeMaxSeconds?: number }>>;
};

export function directorStep(prev: DirectorState, views: Map<string, GameView>, now: number, cfg: DirectorStepConfig): StepResult {
  const state: DirectorState = structuredClone(prev);
  const commands: Command[] = [];
  const decisions: Decision[] = [];
  const dwellMs = cfg.dwellSeconds * 1000;

  const tune = (sc: ScreenState, view: GameView) => {
    const ch = view.channel!;
    commands.push({ type: 'tune', screen: sc.id, gameId: view.game.id, channel: ch.number, channelName: ch.name });
    sc.showing = { kind: 'game', gameId: view.game.id, channel: ch.number };
    sc.lastSwitchAt = now;
    sc.lastNote = null;
  };
  const decide = (sc: ScreenState, rule: Rule, fromLabel: string, reasons: string[], extra: Partial<Decision> = {}) => {
    decisions.push({ at: now, screen: sc.id, rule, switched: true, auto: true, from: fromLabel, to: label(views, sc.showing, sc.mode), reasons, ...extra });
  };
  const note = (sc: ScreenState, rule: Rule, key: string, reasons: string[], extra: Partial<Decision> = {}) => {
    if (sc.lastNote === key) return;
    sc.lastNote = key;
    decisions.push({ at: now, screen: sc.id, rule, switched: false, auto: true, from: label(views, sc.showing, sc.mode), to: label(views, sc.showing, sc.mode), reasons, ...extra });
  };
  const dwellLeft = (sc: ScreenState) => Math.max(0, dwellMs - (now - sc.lastSwitchAt));
  /** Best automatic pick; with allowDuplicates off, a game already on another screen counts as no pick. */
  const pick = (sc: ScreenState, extraExclude: string[] = []) => {
    const r = pickBest(state.screens, sc, views, extraExclude, cfg.candidateMaxBreakRisk);
    return r.duplicate && !cfg.allowDuplicates ? { best: null, ranked: [] as RankedCandidate[], duplicate: false } : r;
  };

  // Screens returning home go first (their home game becomes "taken"), then halftime/final,
  // then screens needing a fill-in, oldest break first.
  const order = [...state.screens].sort((a, b) => priority(a) - priority(b) || since(a) - since(b) || a.id - b.id);
  function priority(sc: ScreenState): number {
    const st = sc.homeGameId ? views.get(sc.homeGameId)?.assessment.state : undefined;
    return st === 'LIVE' || st === 'PRE' ? 0 : st === 'HALFTIME' || st === 'FINAL' ? 1 : st === 'BREAK' ? 2 : 3;
  }
  function since(sc: ScreenState): number {
    return (sc.homeGameId && views.get(sc.homeGameId)?.assessment.since) || 0;
  }

  for (const sc of order) {
    if (!sc.homeGameId || sc.mode === 'LOCKED' || sc.mode === 'ERROR' || sc.mode === 'IDLE') continue;
    const home = views.get(sc.homeGameId);
    if (!home) continue;
    const hs = home.assessment.state;
    const from = label(views, sc.showing, sc.mode);
    const homeReasons = [`home ${home.game.shortName} ${hs === 'BREAK' ? 'BREAK?' : hs} ${home.assessment.score.toFixed(2)}`, ...home.assessment.reasons];
    const sportCfg = cfg.perSport?.[home.game.sport];
    const halftimeMax = sportCfg?.halftimeMaxSeconds ?? cfg.halftimeMaxSeconds;

    // --- Home game over -------------------------------------------------------------------
    if (hs === 'FINAL') {
      if (sc.mode !== 'GAME_OVER') {
        if (now - home.assessment.since < cfg.finalLingerSeconds * 1000) continue;
        sc.mode = 'GAME_OVER';
        sc.gameOver = { since: now, autoPickAt: now + cfg.gameOverAutoPickSeconds * 1000 };
        commands.push({ type: 'showGameOver', screen: sc.id, gameId: home.game.id, autoPickAt: sc.gameOver.autoPickAt });
        decisions.push({ at: now, screen: sc.id, rule: 'GAME_OVER', switched: false, auto: true, from, to: `${from} + pop-up`, reasons: [`final: ${describeGame(home.game)}`, `auto-pick in ${cfg.gameOverAutoPickSeconds}s`], gameId: home.game.id });
        continue;
      }
      if (sc.gameOver?.autoPickAt != null && now >= sc.gameOver.autoPickAt) {
        const { best, ranked, duplicate } = pick(sc);
        if (!best) {
          note(sc, 'NO_CANDIDATE', 'gameover-none', ['game over and no other live game to adopt yet']);
          continue;
        }
        sc.homeGameId = best.view.game.id;
        sc.mode = 'HOME';
        sc.gameOver = null;
        commands.push({ type: 'hideGameOver', screen: sc.id });
        tune(sc, best.view);
        decide(sc, 'AUTO_PICK', from, [`no pick within ${cfg.gameOverAutoPickSeconds}s`, `new home: ${best.view.game.shortName} (${best.why})`], { candidates: topList(ranked), duplicate, gameId: best.view.game.id, tier: best.tier });
      }
      continue;
    }

    // --- Halftime --------------------------------------------------------------------------
    if (hs === 'HALFTIME') {
      if (sc.mode === 'HALFTIME_REEL') {
        if (sc.halftimeSince !== null && now - sc.halftimeSince > halftimeMax * 1000) {
          if (!home.channel) {
            note(sc, 'NO_CANDIDATE', 'home-unavailable', [`home ${home.game.shortName} is not in your lineup`]);
            continue;
          }
          sc.mode = 'HOME';
          sc.halftimeSince = null;
          tune(sc, home);
          decide(sc, 'HALFTIME_OVER', from, [`halftime longer than ${halftimeMax}s; going back to the home game`], { gameId: home.game.id });
        }
        continue;
      }
      // The reel already gave up on this halftime (longer than halftimeMax): don't start it again.
      if (now - home.assessment.since > halftimeMax * 1000) continue;
      if (dwellLeft(sc) > 0) {
        note(sc, 'HOLD_DWELL', 'dwell-halftime', [`halftime, holding ${Math.ceil(dwellLeft(sc) / 1000)}s for dwell`]);
        continue;
      }
      sc.mode = 'HALFTIME_REEL';
      sc.halftimeSince = now;
      sc.showing = { kind: 'halftime' };
      sc.lastSwitchAt = now;
      sc.lastNote = null;
      commands.push({ type: 'showHalftime', screen: sc.id, homeGameId: home.game.id });
      decide(sc, 'HALFTIME', from, [`home ${home.game.shortName} at halftime (${describeGame(home.game)})`], { gameId: home.game.id });
      continue;
    }

    const onHome = shownGameId(sc) === sc.homeGameId;

    // --- Home game in a break ---------------------------------------------------------------
    if (hs === 'BREAK') {
      if (sc.mode === 'HALFTIME_REEL') continue; // reel keeps going until the half really starts
      if (sc.mode === 'HOME' || onHome) {
        const { best, ranked, duplicate } = pick(sc);
        if (!best) {
          note(sc, 'NO_CANDIDATE', 'break-none', [...homeReasons, 'no other live game in play; staying on home']);
          continue;
        }
        if (dwellLeft(sc) > 0) {
          note(sc, 'HOLD_DWELL', `dwell-break-${best.view.game.id}`, [...homeReasons, `would switch to ${best.view.game.shortName}; ${Math.ceil(dwellLeft(sc) / 1000)}s dwell left`]);
          continue;
        }
        sc.mode = 'FILL_IN';
        tune(sc, best.view);
        decide(sc, 'BREAK_FILL', from, [...homeReasons, pickReason(best)], { candidates: topList(ranked), duplicate, gameId: best.view.game.id, tier: best.tier });
        continue;
      }
      if (sc.mode === 'FILL_IN') {
        const currentId = shownGameId(sc);
        const current = currentId ? views.get(currentId) : undefined;
        const { best, ranked, duplicate } = pick(sc, currentId ? [currentId] : []);
        // Another screen went back to this game as its home: move off it if there's anything else.
        const clash = currentId !== null && shownOnOtherScreen(state.screens, sc.id, currentId) && best !== null && !duplicate;
        const currentOk = current?.assessment.state === 'LIVE' && current.game.phase === 'LIVE' && !clash;
        if (!currentOk) {
          const otherScreen = clash ? state.screens.find((x) => x.id !== sc.id && shownGameId(x) === currentId)?.id : undefined;
          const why = clash ? `fill-in ${current?.game.shortName} is also on S${otherScreen}, and another game is available` : `fill-in ${current?.game.shortName ?? currentId} is ${current?.assessment.state ?? 'gone'}`;
          if (dwellLeft(sc) > 0) {
            note(sc, 'HOLD_DWELL', `dwell-replace-${currentId}`, [`${why}; ${Math.ceil(dwellLeft(sc) / 1000)}s dwell left`]);
            continue;
          }
          // Don't hop to a third game if our own break is nearly over: just wait for home.
          const homeLeft = home.assessment.forecast?.remainingSec ?? null;
          const replaceIf = sportCfg?.replaceIfHomeRemainingSeconds ?? cfg.replaceIfHomeRemainingSeconds ?? 0;
          if (!clash && replaceIf > 0 && homeLeft !== null && homeLeft < replaceIf) {
            note(sc, 'HOLD_DWELL', `wait-home-${currentId}`, [`${why}, but home ${home.game.shortName} has only ~${homeLeft}s of break left; staying until it resumes`]);
            continue;
          }
          if (best) {
            tune(sc, best.view);
            decide(sc, 'FILL_REPLACE', from, [why, pickReason(best), ...homeReasons], { candidates: topList(ranked), duplicate, gameId: best.view.game.id, tier: best.tier });
          } else if (!home.channel) {
            note(sc, 'NO_CANDIDATE', 'home-unavailable', [`${why}, and home ${home.game.shortName} is not in your lineup`]);
          } else {
            sc.mode = 'HOME';
            tune(sc, home);
            decide(sc, 'RETURN_HOME', from, [`${why} and nothing else is in play`, ...homeReasons], { gameId: home.game.id, duplicate: shownOnOtherScreen(state.screens, sc.id, home.game.id) });
          }
          continue;
        }
        // Upgrade only within the screen's own sport, to a game at a hot moment (red zone, power play…).
        const currentHot = sportOf(current!.game.sport).excitement(current!.game).hot;
        const upgrade = sportCfg?.upgradeFillInToRedZone ?? cfg.upgradeFillInToRedZone;
        if (upgrade && !currentHot && best?.hot && best.tier === 1 && !duplicate && dwellLeft(sc) === 0) {
          tune(sc, best.view);
          decide(sc, 'FILL_UPGRADE', from, [`${best.view.game.shortName} ${best.hot.phrase} (${best.why})`, ...homeReasons], { candidates: topList(ranked), gameId: best.view.game.id, tier: best.tier });
        }
        continue;
      }
      continue;
    }

    // --- Home game in play (or not started / unknown) ----------------------------------------
    // Missing data is not "back in play": don't bounce a fill-in, a game-over pop-up or a halftime reel.
    if (hs === 'UNKNOWN' && (sc.mode === 'FILL_IN' || sc.mode === 'GAME_OVER' || sc.mode === 'HALFTIME_REEL')) continue;
    if (!onHome || sc.mode !== 'HOME') {
      const firstTune = sc.showing.kind === 'none';
      // On a substitute, stay at least minSubstituteSeconds so the screen never flips straight back.
      const holdMs = sc.mode === 'FILL_IN' ? Math.max(dwellMs, (cfg.minSubstituteSeconds ?? 0) * 1000) : dwellMs;
      const holdLeft = Math.max(0, holdMs - (now - sc.lastSwitchAt));
      if (!firstTune && holdLeft > 0) {
        note(sc, 'HOLD_DWELL', 'dwell-home', [...homeReasons, `home is back; ${Math.ceil(holdLeft / 1000)}s left on the substitute first`]);
        continue;
      }
      if (!home.channel) {
        note(sc, 'NO_CANDIDATE', 'home-unavailable', [`home ${home.game.shortName} is not in your lineup`]);
        continue;
      }
      const wasReel = sc.mode === 'HALFTIME_REEL';
      sc.mode = 'HOME';
      sc.halftimeSince = null;
      tune(sc, home);
      // A screen's own home game always wins; if another screen was filling in with it, that screen moves off next.
      const duplicate = shownOnOtherScreen(state.screens, sc.id, home.game.id);
      decide(sc, firstTune ? 'HOME_SYNC' : wasReel ? 'HALFTIME_OVER' : 'RETURN_HOME', from, wasReel ? [`2nd half under way: ${describeGame(home.game)}`] : homeReasons, { gameId: home.game.id, duplicate });
    }
  }
  return { state, commands, decisions };
}

// ---------------------------------------------------------------------------------------------
// Your commands (bypass dwell)

export function applyAction(prev: DirectorState, action: UserAction, views: Map<string, GameView>, now: number): StepResult {
  const state: DirectorState = structuredClone(prev);
  const commands: Command[] = [];
  const decisions: Decision[] = [];
  const sc = state.screens.find((x) => x.id === action.screen);
  if (!sc) return { state, commands, decisions };
  const from = label(views, sc.showing, sc.mode);
  const record = (rule: Rule, switched: boolean, reasons: string[], gameId?: string) =>
    decisions.push({ at: now, screen: sc.id, rule, switched, auto: false, from, to: label(views, sc.showing, sc.mode), reasons, gameId });
  const tuneTo = (view: GameView) => {
    commands.push({ type: 'tune', screen: sc.id, gameId: view.game.id, channel: view.channel!.number, channelName: view.channel!.name });
    sc.showing = { kind: 'game', gameId: view.game.id, channel: view.channel!.number };
    sc.lastSwitchAt = now;
    sc.lastNote = null;
  };
  const modeForShowing = (): ScreenMode =>
    sc.showing.kind === 'halftime' ? 'HALFTIME_REEL' : sc.showing.kind === 'game' && sc.showing.gameId !== sc.homeGameId ? 'FILL_IN' : sc.homeGameId ? 'HOME' : 'IDLE';

  switch (action.type) {
    case 'setHome':
    case 'force': {
      const view = views.get(action.gameId);
      if (!view?.channel) {
        record('USER_REJECTED', false, [`${view?.game.shortName ?? action.gameId} is not available in your lineup`]);
        break;
      }
      if (sc.mode === 'GAME_OVER') commands.push({ type: 'hideGameOver', screen: sc.id });
      sc.gameOver = null;
      sc.halftimeSince = null;
      sc.error = null;
      if (action.type === 'setHome') {
        sc.homeGameId = view.game.id;
        sc.mode = 'HOME';
        tuneTo(view);
        record('USER_SET_HOME', true, [`you picked ${view.game.shortName} as home`], view.game.id);
      } else {
        sc.mode = 'LOCKED';
        tuneTo(view);
        record('USER_FORCE', true, [`you forced ${view.game.shortName}; screen locked until you send it home`], view.game.id);
      }
      break;
    }
    case 'lock':
      sc.mode = 'LOCKED';
      record('USER_LOCK', false, ['locked by you: no automatic switches']);
      break;
    case 'unlock':
      sc.mode = modeForShowing();
      record('USER_UNLOCK', false, ['unlocked: automatic switching resumes']);
      break;
    case 'goHome': {
      const home = sc.homeGameId ? views.get(sc.homeGameId) : undefined;
      if (!home?.channel) {
        record('USER_REJECTED', false, ['no home game to go back to']);
        break;
      }
      if (sc.mode === 'GAME_OVER') commands.push({ type: 'hideGameOver', screen: sc.id });
      sc.gameOver = null;
      sc.halftimeSince = null;
      sc.mode = 'HOME';
      tuneTo(home);
      record('USER_HOME', true, [`back to home ${home.game.shortName}`], home.game.id);
      break;
    }
    case 'skip': {
      const current = shownGameId(sc);
      const { best, duplicate } = pickBest(state.screens, sc, views, current ? [current] : []);
      if (!best) {
        record('USER_REJECTED', false, ['no other game is in play right now']);
        break;
      }
      if (sc.mode === 'GAME_OVER') commands.push({ type: 'hideGameOver', screen: sc.id });
      sc.gameOver = null;
      sc.halftimeSince = null;
      sc.mode = 'LOCKED';
      tuneTo(best.view);
      record('USER_SKIP', true, [`you skipped to the best other game: ${best.view.game.shortName} (${tierLabel(best)}: ${best.why})${duplicate ? ' [already on another screen]' : ''}`, 'locked until you send it home'], best.view.game.id);
      break;
    }
    case 'cancelAutoPick':
      if (sc.mode === 'GAME_OVER' && sc.gameOver) {
        sc.gameOver = { ...sc.gameOver, autoPickAt: null };
        commands.push({ type: 'showGameOver', screen: sc.id, gameId: sc.homeGameId ?? '', autoPickAt: null });
        record('USER_KEEP', false, ['you chose to stay on this channel; no auto-pick']);
      }
      break;
    case 'streamError':
      sc.error = { detail: action.detail, since: now, mode: sc.mode === 'ERROR' ? sc.error?.mode : sc.mode };
      sc.mode = 'ERROR';
      record('STREAM_ERROR', false, [action.detail]);
      break;
    case 'streamOk':
      if (sc.mode === 'ERROR') {
        const before = sc.error?.mode;
        sc.error = null;
        sc.mode = before === 'LOCKED' || before === 'GAME_OVER' ? before : modeForShowing();
        record('STREAM_RECOVERED', false, ['stream playing again']);
      }
      break;
  }
  return { state, commands, decisions };
}
