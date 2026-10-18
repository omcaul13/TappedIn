import type { Assessment, GameSnapshot } from '../engine/types';

// What the app window's UI and the local pages (data tiles, halftime, picker, control panel) see. Plain JSON.

export interface TeamDTO {
  id: string;
  abbr: string;
  name: string;
  score: number;
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
}

export interface GameDTO {
  id: string;
  shortName: string;
  name: string;
  phase: GameSnapshot['phase'];
  detail: string;
  period: number | null;
  startTime: string | null;
  home: TeamDTO;
  away: TeamDTO;
  networks: string[];
  channel: { name: string; number: number } | null;
  /** Why it can't be watched (streaming-only, not in lineup), when channel is null. */
  unavailable: string | null;
  situation: {
    possessionTeamId: string | null;
    downDistanceText: string | null;
    yardsToEndzone: number | null;
    isRedZone: boolean;
    lastPlay: string | null;
  } | null;
  assessment: Pick<Assessment, 'state' | 'score' | 'reasons' | 'since' | 'forecast'> | null;
}

/** Game-over picker: live games (score, quarter) and later games (kickoff, network), watchable only. */
export interface PickerDTO {
  title: string;
  live: { id: string; label: string; detail: string }[];
  later: { id: string; label: string; detail: string }[];
}

export interface ScreenDTO {
  id: number;
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
  /** Each college-football network and the guide row it's mapped to. */
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
  /** focus 0 = all muted. */
  audio: { mode: 'manual' | 'auto'; focus: number };
  feed: FeedItem[];
  labels: number;
  settings: SettingsDTO;
}

export function gameDTO(g: GameSnapshot, a: Assessment | undefined, channel: GameDTO['channel'], unavailable: string | null): GameDTO {
  const s = g.situation;
  return {
    id: g.id,
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
    assessment: a ? { state: a.state, score: a.score, reasons: a.reasons, since: a.since, forecast: a.forecast } : null,
  };
}
