import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { z } from 'zod';
import type { SportId } from './engine/types';
import { SPORT_IDS, sportOf } from './sports';
import type { SportPreset } from './sports/types';

// One editable file: config/redzone.config.json5. Every knob has a default here, so the file only
// needs what you want to change. Thresholds hot-reload while the app runs (see watchConfig).

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
export const CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'redzone.config.json5');

const signal = (weight: number, windowSeconds: number) =>
  z
    .object({
      /** Contribution to the break score while active (0–1). */
      weight: z.number().min(0).max(1).default(weight),
      /** How long after the event the signal stays active. */
      windowSeconds: z.number().positive().default(windowSeconds),
    })
    .prefault({});

const preset = (minBreakSeconds: number, confidence: number, replaceIfHomeRemainingSeconds: number, upgradeToRedZone: boolean) =>
  z
    .object({
      /** Only switch when the break is predicted to have at least this long left for you… */
      minBreakSeconds: z.number().min(0).default(minBreakSeconds),
      /** …with at least this probability (from the recorded-games model). */
      confidence: z.number().min(0).max(1).default(confidence),
      /** A substitute that goes to break is swapped for a third game only if your game still has this much
       *  break predicted; otherwise the screen stays on the substitute until your game resumes. */
      replaceIfHomeRemainingSeconds: z.number().min(0).default(replaceIfHomeRemainingSeconds),
      /** Move an already-running fill-in to a game that reaches the red zone. */
      upgradeToRedZone: z.boolean().default(upgradeToRedZone),
    })
    .prefault({});

/** A per-sport tweak of one sensitivity level; anything left out keeps the sport's own default. */
const PresetOverride = z
  .object({
    minBreakSeconds: z.number().min(0),
    confidence: z.number().min(0).max(1),
    replaceIfHomeRemainingSeconds: z.number().min(0),
    upgradeToHot: z.boolean(),
    excludeCategories: z.array(z.string()),
  })
  .partial();

const SensitivitySchema = z.enum(['low', 'medium', 'high']);

const SportOverride = z
  .object({
    /** This sport's own sensitivity (leave out to follow the global one). */
    sensitivity: SensitivitySchema.optional(),
    presets: z.object({ low: PresetOverride, medium: PresetOverride, high: PresetOverride }).partial().optional(),
    /** Stream and data delays if this sport's feed runs differently. */
    streamDelaySeconds: z.number().min(0).optional(),
    dataDelaySeconds: z.number().min(0).optional(),
  })
  .strict();

export const ChannelSchema = z.object({
  number: z.number().int().positive().nullable(),
  callSign: z.string().optional(),
  /** The service's own id for the channel (Spectrum tmsid, YouTube TV watch id, Sling guid). */
  ref: z.string().optional(),
  aliases: z.array(z.string()).default([]),
});

export const ConfigSchema = z.object({
  /** Which TV service the screens play (config/providers/<id>.json). */
  provider: z.string().default('xfinity-on-campus'),

  chrome: z
    .object({
      executablePath: z.string().default('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
      profileDir: z.string().default('%LOCALAPPDATA%\\RedZone\\chrome-profile'),
      debugPort: z.number().int().default(9333),
      xfinityStartUrl: z.string().default('https://www.xfinityoncampus.com/'),
    })
    .prefault({}),

  /** The one-window app (castLabs Electron with Widevine). `npm run start:chrome` uses Chrome tiles instead. */
  electron: z
    .object({
      /** Electron's own data (keeps your Xfinity On Campus sign-in). */
      userDataDir: z.string().default('%LOCALAPPDATA%\\RedZone\\electron'),
      /** Local debugging port the app drives the Xfinity views through (localhost only). */
      debugPort: z.number().int().default(9335),
      /** On this laptop (Intel Arc + NVIDIA) Windows' DirectComposition video path left some tiles black. */
      disableDirectComposition: z.boolean().default(true),
      /**
       * Extra hidden Xfinity views. A substitute loads in one while the screen keeps showing its game, and
       * the screen's own game keeps playing (muted, hidden) so going back is instant. Each one can be an
       * extra stream: 6 at once worked on 10/17/2026. 0 turns this off. Leave it out to use the
       * service's default (0: most services allow only a few streams).
       */
      standbyViews: z.number().int().min(0).max(4).optional(),
    })
    .prefault({}),

  espn: z
    .object({
      sport: z.string().default('football/college-football'),
      groups: z.string().default('80'),
      requestTimeoutMs: z.number().int().positive().default(8000),
      scoreboardLiveSeconds: z.number().positive().default(12),
      scoreboardIdleSeconds: z.number().positive().default(60),
      /** A sport with no games today is checked this rarely. */
      scoreboardEmptySeconds: z.number().positive().default(900),
      summarySeconds: z.number().positive().default(15),
      /** Play-by-play for the games on screen (homes and substitutes) comes this often. */
      hotSummarySeconds: z.number().positive().default(6),
      maxSummaryGames: z.number().int().positive().default(8),
      jitterSeconds: z.number().min(0).default(2),
      /** A game whose data is older than this is UNKNOWN and never auto-picked. */
      staleDataSeconds: z.number().positive().default(60),
    })
    .prefault({}),

  director: z
    .object({
      /** Minimum time between automatic switches on one screen. */
      dwellSeconds: z.number().min(0).default(20),
      /** Move a fill-in that isn't in the red zone to a game that is. */
      upgradeFillInToRedZone: z.boolean().default(true),
      /** Fill a break with a game already on another screen when nothing else is in play (false = stay on the commercial). */
      allowDuplicates: z.boolean().default(true),
      /** Game-over pop-up: adopt the best live game as the new home after this long. */
      gameOverAutoPickSeconds: z.number().min(0).default(120),
      /** Keep showing a just-finished game this long (after the viewer sees the end) before the pop-up. */
      finalLingerSeconds: z.number().min(0).default(20),
      /** Safety: leave the halftime reel after this long even if ESPN still says halftime. */
      halftimeMaxSeconds: z.number().positive().default(1500),
      /** Engine tick interval. */
      tickSeconds: z.number().positive().default(2),
    })
    .prefault({}),

  breakDetector: z
    .object({
      /** How far the Xfinity picture runs behind a play's real (wallclock) time. Measured ~30s on 10/17. */
      streamDelaySeconds: z.number().min(0).default(30),
      /** For events seen only on the scoreboard (no wallclock): estimated time from play to ESPN data. */
      dataDelaySeconds: z.number().min(0).default(25),
      /** Extra seconds to stay on a score before cutting away (celebration/replay). */
      lingerSeconds: z.number().min(0).default(5),
      enterThreshold: z.number().min(0).max(1).default(0.6),
      exitThreshold: z.number().min(0).max(1).default(0.3),
      /** Assume play resumed after this long in a break even without a new play. */
      maxBreakSeconds: z.number().positive().default(200),
      signals: z
        .object({
          timeout: signal(0.6, 150),
          score: signal(0.7, 150),
          kickoffAfterScore: signal(0.4, 120),
          endOfPeriod: signal(0.8, 150),
          twoMinuteWarning: signal(0.5, 150),
          review: signal(0.6, 120),
          injury: signal(0.4, 120),
          possessionChange: signal(0.2, 90),
        })
        .prefault({}),
      stale: z
        .object({
          /** No new play for this long starts adding to the break score… */
          afterSeconds: z.number().positive().default(75),
          /** …by `perStep` every `stepSeconds`, up to `max`. */
          stepSeconds: z.number().positive().default(15),
          perStep: z.number().min(0).max(1).default(0.15),
          max: z.number().min(0).max(1).default(0.9),
        })
        .prefault({}),
    })
    .prefault({}),

  switching: z
    .object({
      /** "forecast": break forecast learned from recorded games. "classic": the original weighted signals (kept for comparison). */
      breakModel: z.enum(['forecast', 'classic']).default('forecast'),
      /** How eagerly screens leave their home game. Low = only clearly long breaks. */
      sensitivity: z.enum(['low', 'medium', 'high']).default('low'),
      presets: z
        .object({
          low: preset(60, 0.75, 120, false),
          medium: preset(60, 0.7, 90, false),
          high: preset(45, 0.65, 60, true),
        })
        .prefault({}),
      /** Stay at least this long on a substitute game before going back home. */
      minSubstituteSeconds: z.number().min(0).default(30),
      /** Skip substitutes that are probably in a stoppage themselves (their own break forecast at or above this). */
      candidateMaxBreakRisk: z.number().min(0).max(1).default(0.5),
      /** Data safety net: if your game shows no new play for this long, go back anyway. */
      maxBreakSeconds: z.number().positive().default(600),
      /** College football's break model, built by `npm run build-break-model` (other sports: config/break-models/<sport>.json). */
      modelFile: z.string().default('config/break-models/cfb.json'),
    })
    .prefault({}),

  /** Which sports to follow, and per-sport switching tweaks (src/sports/ holds each sport's defaults). */
  sports: z
    .object({
      /** Sports polled, listed in the picker and used as fill-ins. */
      enabled: z
        .array(z.string().refine((id) => (SPORT_IDS as string[]).includes(id), { message: `unknown sport (known: ${SPORT_IDS.join(', ')})` }))
        .default(() => [...SPORT_IDS]),
      /** Your TV market: its teams' regional NFL games count as the ones your CBS/FOX show. */
      market: z.string().default('Boston'),
      /** Per sport: { nhl: { sensitivity: 'medium', presets: { low: { confidence: 0.8 } } } }. College football also follows `switching.presets`. */
      overrides: z.record(z.string(), SportOverride).default({}),
    })
    .prefault({}),

  audio: z
    .object({
      mode: z.enum(['manual', 'auto']).default('manual'),
      /** Auto mode: minimum time between audio moves. */
      autoDwellSeconds: z.number().min(0).default(30),
      /** Auto mode: clicking a tile pins audio there this long. */
      manualPinSeconds: z.number().min(0).default(120),
    })
    .prefault({}),

  windows: z
    .object({
      /** Chrome --app windows: no tab strip or address bar, more pixels for video. */
      appMode: z.boolean().default(true),
      /** Small state badge drawn on each tile. */
      badge: z.boolean().default(true),
      /** Seconds a freshly tuned stream gets to start playing before it counts as failed. */
      startupTimeoutSeconds: z.number().positive().default(25),
      /** Seconds without playback progress (after it played) before a stream counts as stalled. */
      stallSeconds: z.number().positive().default(12),
      /** Try a cached channel URL (in-page switch, then full load) before clicking through the guide. */
      fastPath: z.boolean().default(true),
      /** Fast path gets this long to start playing before falling back to the guide. */
      fastPathTimeoutSeconds: z.number().positive().default(12),
      /** Most simultaneous Xfinity streams to attempt; lowered automatically if Xfinity reports a limit. */
      maxConcurrentStreams: z.number().int().min(1).max(4).default(4),
      /** How often a failed screen retries its channel. */
      errorRetrySeconds: z.number().positive().default(60),
    })
    .prefault({}),

  highlights: z
    .object({
      /** Use ESPN's own highlight clips (direct MP4s from the game summary). */
      espnClips: z.boolean().default(true),
      /** Use official YouTube highlight packages for finished games (needs YT_API_KEY in .env). */
      youtube: z.boolean().default(true),
      /** A YouTube result must come from a channel whose name contains one of these. */
      youtubeChannels: z
        .array(z.string())
        .default(['ESPN College Football', 'ESPN', 'SEC Network', 'ACC Digital Network', 'ACC Network', 'Big Ten Network', 'FOX College Football', 'FOX Sports', 'CBS Sports', 'NBC Sports', 'Big 12 Conference', 'Mountain West', 'The CW']),
      /** Each search costs 100 of your 10,000 daily quota units. */
      maxYoutubeSearchesPerDay: z.number().int().min(0).default(40),
      /** Official uploads appear a while after the final; don't search before this. */
      youtubeMinMinutesAfterFinal: z.number().min(0).default(20),
      /** Show the scores board after this many clips. */
      cardEveryClips: z.number().int().min(1).default(4),
      cardSeconds: z.number().positive().default(8),
      /** Clips per other live game per reel. */
      maxClipsPerLiveGame: z.number().int().min(1).default(3),
      /** Only live-game clips published within this many minutes. */
      recentMinutes: z.number().positive().default(120),
      /** Start the reel with your home game's first-half plays. */
      includeHomeGame: z.boolean().default(true),
      /** Summaries fetched per refresh (one request every ~0.6 s). */
      maxGamesPerRefresh: z.number().int().positive().default(14),
    })
    .prefault({}),

  server: z
    .object({
      /** Local web server for data tiles, the halftime screen and (Phase 3) the control panel. */
      port: z.number().int().min(1024).max(65535).default(7480),
    })
    .prefault({}),

  channels: z.record(z.string(), ChannelSchema).default({}),
  unavailable: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ChannelEntry = z.infer<typeof ChannelSchema>;
export type BreakDetectorConfig = Config['breakDetector'];
export type DirectorConfig = Config['director'];
export type AudioConfig = Config['audio'];
export type WindowsConfig = Config['windows'];
export type HighlightsConfig = Config['highlights'];
export type Sensitivity = Config['switching']['sensitivity'];

/** Director settings after applying the switching model and sensitivity. */
export interface DirectorSettings extends DirectorConfig {
  minSubstituteSeconds: number;
  replaceIfHomeRemainingSeconds: number;
  candidateMaxBreakRisk?: number;
  perSport?: Partial<Record<SportId, { replaceIfHomeRemainingSeconds: number; upgradeFillInToRedZone: boolean; halftimeMaxSeconds?: number }>>;
}

/** The sensitivity a sport runs at: its own override, else the global one. */
export function sportSensitivity(cfg: Config, sport: SportId): Sensitivity {
  return cfg.sports.overrides[sport]?.sensitivity ?? cfg.switching.sensitivity;
}

/**
 * A sport's switching numbers at its sensitivity: the sport's defaults (college football: the
 * `switching.presets` in the config file), with any `sports.overrides.<sport>.presets` on top.
 */
export function sportPreset(cfg: Config, sport: SportId, sensitivity = sportSensitivity(cfg, sport)): SportPreset {
  const base: SportPreset =
    sport === 'cfb'
      ? (({ upgradeToRedZone, ...p }) => ({ ...p, upgradeToHot: upgradeToRedZone, excludeCategories: [] }))(cfg.switching.presets[sensitivity])
      : { ...sportOf(sport).presets[sensitivity] };
  const o = cfg.sports.overrides[sport]?.presets?.[sensitivity];
  return o ? { ...base, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } : base;
}

/** Sports the app follows, as typed ids. */
export function enabledSports(cfg: Config): SportId[] {
  return cfg.sports.enabled.filter((id): id is SportId => (SPORT_IDS as string[]).includes(id));
}

/**
 * What the director should actually use. "classic" reproduces the original behaviour exactly
 * (no minimum time on a substitute, always replace, upgrades per director config) so before/after
 * comparisons are fair; "forecast" applies the sensitivity preset. The classic model is college
 * football's only: other sports always use their forecast presets.
 */
export function directorSettings(cfg: Config): DirectorSettings {
  const classic = cfg.switching.breakModel === 'classic';
  const perSport: DirectorSettings['perSport'] = {};
  for (const id of SPORT_IDS) {
    if (id === 'cfb') continue; // college football uses the top-level values below
    const p = sportPreset(cfg, id);
    perSport[id] = { replaceIfHomeRemainingSeconds: p.replaceIfHomeRemainingSeconds, upgradeFillInToRedZone: p.upgradeToHot, halftimeMaxSeconds: sportOf(id).halftimeMaxSeconds };
  }
  if (classic) return { ...cfg.director, minSubstituteSeconds: 0, replaceIfHomeRemainingSeconds: 0, perSport };
  const p = sportPreset(cfg, 'cfb');
  return {
    ...cfg.director,
    upgradeFillInToRedZone: p.upgradeToHot,
    minSubstituteSeconds: cfg.switching.minSubstituteSeconds,
    replaceIfHomeRemainingSeconds: p.replaceIfHomeRemainingSeconds,
    candidateMaxBreakRisk: cfg.switching.candidateMaxBreakRisk,
    perSport,
  };
}

/** Validate a plain object (already parsed) into a full Config with defaults. */
export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw ?? {});
  if (!result.success) throw new Error(`Invalid config:\n${z.prettifyError(result.error)}`);
  const cfg = result.data;
  cfg.chrome.profileDir = path.resolve(PROJECT_ROOT, expandEnv(cfg.chrome.profileDir));
  cfg.electron.userDataDir = path.resolve(PROJECT_ROOT, expandEnv(cfg.electron.userDataDir));
  return cfg;
}

export function loadConfig(file = CONFIG_PATH): Config {
  return parseConfig(JSON5.parse(readFileSync(file, 'utf8')));
}

/**
 * Re-load the config whenever the file changes. Invalid edits are reported and ignored, so a typo
 * mid-game never takes the app down. Returns a function that stops watching.
 */
export function watchConfig(onChange: (cfg: Config) => void, onError: (msg: string) => void, file = CONFIG_PATH): () => void {
  let timer: NodeJS.Timeout | undefined;
  const watcher = watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        onChange(loadConfig(file));
      } catch (err) {
        onError(String(err instanceof Error ? err.message : err));
      }
    }, 300);
  });
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

// ---- settings changed in the app ---------------------------------------------------------------
// The settings drawer saves here instead of rewriting the commented config file; these win over the
// file until you press "Reset to config file".

export const SETTINGS_FILE = path.join(PROJECT_ROOT, '.state', 'settings.json');

const OverridesSchema = z
  .object({
    sensitivity: z.enum(['low', 'medium', 'high']).optional(),
    /** Per-sport sensitivity from the settings drawer ("Same as global" = absent). */
    sportSensitivity: z.record(z.string(), SensitivitySchema).optional(),
    /** Each screen's sport, remembered across starts. */
    screenSports: z.array(z.string()).max(4).optional(),
    enabledSports: z.array(z.string()).optional(),
    dwellSeconds: z.number().min(5).max(120).optional(),
    minSubstituteSeconds: z.number().min(0).max(300).optional(),
    scoreboardLiveSeconds: z.number().min(5).max(60).optional(),
    summarySeconds: z.number().min(5).max(60).optional(),
    hotSummarySeconds: z.number().min(3).max(30).optional(),
    allowDuplicates: z.boolean().optional(),
    provider: z.string().regex(/^[a-z0-9-]+$/).optional(),
    standbyViews: z.number().int().min(0).max(4).optional(),
  })
  .strict();
export type SettingsOverrides = z.infer<typeof OverridesSchema>;

/** Validate a settings change from the UI (throws with a readable message). */
export function parseOverrides(raw: unknown): SettingsOverrides {
  const r = OverridesSchema.safeParse(raw);
  if (!r.success) throw new Error(z.prettifyError(r.error));
  return r.data;
}

export function loadOverrides(file = SETTINGS_FILE): SettingsOverrides {
  try {
    return OverridesSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
}

export function saveOverrides(o: SettingsOverrides, file = SETTINGS_FILE): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(o, null, 2));
}

export function withOverrides(cfg: Config, o: SettingsOverrides): Config {
  const c = structuredClone(cfg);
  if (o.sensitivity) c.switching.sensitivity = o.sensitivity;
  for (const [id, sens] of Object.entries(o.sportSensitivity ?? {})) {
    if (!(SPORT_IDS as string[]).includes(id)) continue;
    c.sports.overrides[id] = { ...c.sports.overrides[id], sensitivity: sens };
  }
  if (o.enabledSports) c.sports.enabled = o.enabledSports.filter((id) => (SPORT_IDS as string[]).includes(id));
  if (o.dwellSeconds !== undefined) c.director.dwellSeconds = o.dwellSeconds;
  if (o.minSubstituteSeconds !== undefined) c.switching.minSubstituteSeconds = o.minSubstituteSeconds;
  if (o.scoreboardLiveSeconds !== undefined) c.espn.scoreboardLiveSeconds = o.scoreboardLiveSeconds;
  if (o.summarySeconds !== undefined) c.espn.summarySeconds = o.summarySeconds;
  if (o.hotSummarySeconds !== undefined) c.espn.hotSummarySeconds = o.hotSummarySeconds;
  if (o.allowDuplicates !== undefined) c.director.allowDuplicates = o.allowDuplicates;
  if (o.provider) c.provider = o.provider;
  if (o.standbyViews !== undefined) c.electron.standbyViews = o.standbyViews;
  return c;
}

/** Expand Windows-style %VAR% references. */
function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole);
}
