import type { Assessment, GameSnapshot, LiveDetail, SportFamily, SportId, TennisInfo } from '../engine/types';
import { sportOf } from '../sports';

// What the app window's UI and the local pages (data tiles, halftime, picker, control panel) see. Plain JSON.

export interface TeamDTO {
  id: string;
  abbr: string;
  name: string;
  score: number;
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
  rank?: number | null;
  record?: string | null;
}

export interface GameDTO {
  id: string;
  sport: SportId;
  /** "NHL", "MCBB" (header label). */
  sportShort: string;
  family: SportFamily;
  shortName: string;
  name: string;
  phase: GameSnapshot['phase'];
  detail: string;
  period: number | null;
  startTime: string | null;
  home: TeamDTO;
  away: TeamDTO;
  networks: string[];
  channel: { name: string; number: number; regional?: 'confirmed' | 'unconfirmed' } | null;
  /** Why it can't be watched (streaming-only, not in lineup), when channel is null. */
  unavailable: string | null;
  situation: {
    possessionTeamId: string | null;
    downDistanceText: string | null;
    yardsToEndzone: number | null;
    isRedZone: boolean;
    lastPlay: string | null;
  } | null;
  /** Other sports' live situation (power play, bases, count) for tiles. */
  live: LiveDetail | null;
  /** Tennis: sets, server, points, tournament. */
  tennis: TennisInfo | null;
  /** The sport's hot moment right now ("red zone", "power play", "clutch time"), or null. */
  hot: string | null;
  /** 0–100, comparable across sports. */
  excitement: number;
  assessment: Pick<Assessment, 'state' | 'score' | 'reasons' | 'since' | 'forecast'> | null;
}

/** One sport in the picker: how many games today, how many live, and its switching level. */
export interface SportDTO {
  id: SportId;
  name: string;
  short: string;
  family: SportFamily;
  level: 'pro' | 'college';
  games: number;
  live: number;
  /** Followed (polled, offered, used as fill-ins). */
  enabled: boolean;
  /** This sport's own sensitivity, or null for "same as global". */
  sensitivity: 'low' | 'medium' | 'high' | null;
}

/** Game-over picker: live games (score, quarter) and later games (kickoff, network), watchable only. */
export interface PickerDTO {
  title: string;
  live: { id: string; label: string; detail: string; sport: SportId }[];
  later: { id: string; label: string; detail: string; sport: SportId }[];
}

export interface ScreenDTO {
  id: number;
  /** The screen's sport: its home game's, or the one you chose before picking a game. */
  sport: SportId | null;
  mode: string;
  homeGameId: string | null;
  showingGameId: string | null;
  showingKind: 'none' | 'game' | 'halftime';
  /** How the window renders it: Xfinity video, a local data tile, or another local page. */
  render: 'video' | 'data' | 'local' | 'none';
  dataReason: string | null;
  health: { state: string; detail: string } | null;
  error: { title: string; hint: string } | null;
  gameOverAutoPickAt: number | null;
  /** Set while the screen's home game is over and the pop-up is up. */
  picker: PickerDTO | null;
  audio: boolean;
  /** Between a channel change and the new video playing (background: loading behind the current picture). */
  switching: { gameId: string; channelName: string; since: number; background: boolean } | null;
  /** The last automatic switch on this screen and why (shown while on another game). */
  lastSwitch: { at: number; rule: string; reasons: string[] } | null;
}

/** Settings you can change from the app (saved in .state/settings.json, over the config file). */
export interface SettingsDTO {
  sensitivity: 'low' | 'medium' | 'high';
  breakModel: 'forecast' | 'classic';
  dwellSeconds: number;
  minSubstituteSeconds: number;
  scoreboardLiveSeconds: number;
  summarySeconds: number;
  hotSummarySeconds: number;
  allowDuplicates: boolean;
  gameOverAutoPickSeconds: number;
  enterThreshold: number;
  youtube: boolean;
  /** The tickers: on/off, what they show, mini ticker interval, big ticker height and speed. */
  ticker: import('../config').TickerConfig;
  /** Settings changed in the app (they win over the config file until reset). */
  overridden: string[];
}

export interface FeedItem {
  at: number;
  kind: 'switch' | 'note' | 'game' | 'audio' | 'info' | 'label';
  screen: number | null;
  text: string;
}

import type { ProviderSummary } from '../providers/types';
import type { SetupView } from '../setup/runner';

export interface DiagDTO {
  providerId: string;
  providerName: string;
  status: 'stable' | 'experimental' | 'unsupported';
  results: Partial<Record<'signin' | 'scan' | 'tune' | 'playback' | 'hide', import('../setup/diagnostics').DiagResult>>;
  /** Editable values for each step's fields (current merged config). */
  values: Record<string, unknown>;
  /** The saved user override for this provider. */
  override: Record<string, unknown>;
  running: string | null;
  exportPath: string | null;
}

export interface ServiceDTO {
  id: string;
  name: string;
  status: 'stable' | 'experimental' | 'unsupported';
  documentedMaxStreams: number | null;
  measuredStreams: number | null;
  screens: number;
  standbyViews: number;
  /** Each sports network and the guide row it's mapped to. */
  lineup: { key: string; row: number | null; label: string | null; number: number | null }[];
  /** Guide rows from the last scan (empty before the first scan). */
  rows: { index: number; label: string; number: number | null }[];
  lineupAt: string | null;
  testedAt: string | null;
}

export interface AppState {
  now: number;
  mode: 'live' | 'dry-run' | 'replay';
  shell: 'electron' | 'chrome';
  /** First-run setup in progress (the UI shows it instead of the screens), else null. */
  setup: SetupView | null;
  /** Every service RedZone has an adapter for (the picker lists them). */
  providers: ProviderSummary[];
  /** The settings page's "TV service" tab. */
  service: ServiceDTO;
  /** Diagnostics mode, when open. */
  diag: DiagDTO | null;
  /** The TV service the screens play. */
  provider: { id: string; name: string; shortName: string; status: 'stable' | 'experimental' | 'unsupported' };
  /** The service's sign-in progress (one-window app). */
  signin: { state: 'signing-in' | 'needed' | 'ok' | 'failed'; detail: string } | null;
  streamLimit: number;
  screens: ScreenDTO[];
  games: GameDTO[];
  /** Every supported sport, in picker order, with today's game counts. */
  sports: SportDTO[];
  /** focus 0 = all muted. */
  audio: { mode: 'manual' | 'auto'; focus: number };
  /** Per-screen fullscreen: the screen filling the window (0: the grid). */
  view: { fullscreen: number };
  /** Games of sports you don't follow, for a ticker set to "all sports" (empty otherwise). */
  tickerExtra: GameDTO[];
  feed: FeedItem[];
  labels: number;
  settings: SettingsDTO;
}

export function gameDTO(g: GameSnapshot, a: Assessment | undefined, channel: GameDTO['channel'], unavailable: string | null): GameDTO {
  const s = g.situation;
  const mod = sportOf(g.sport);
  const x = mod.excitement(g);
  return {
    id: g.id,
    sport: mod.id,
    sportShort: mod.short,
    family: mod.family,
    shortName: g.shortName,
    name: g.name,
    phase: g.phase,
    detail: g.detail,
    period: g.period,
    startTime: g.startTime,
    home: g.home,
    away: g.away,
    networks: g.networks,
    channel,
    unavailable: channel ? null : unavailable,
    situation: s ? { possessionTeamId: s.possessionTeamId, downDistanceText: s.downDistanceText, yardsToEndzone: s.yardsToEndzone, isRedZone: s.isRedZone, lastPlay: s.lastPlay?.text ?? null } : null,
    live: g.live ?? null,
    tennis: g.tennis ?? null,
    hot: g.phase === 'LIVE' ? (x.hot?.label ?? null) : null,
    excitement: x.score,
    assessment: a ? { state: a.state, score: a.score, reasons: a.reasons, since: a.since, forecast: a.forecast } : null,
  };
}
