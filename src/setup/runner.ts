import type { Config } from '../config';
import { channelRef } from '../providers/lineup';
import { lineupFromScan } from './lineupEdit';
import type { ChannelRef, DiscoveredChannel, ProviderSummary } from '../providers/types';
import type { SigninStatus } from '../shell';
import { ERROR_STATES, type StreamState } from '../windows/health';
import type { SetupState } from './state';

// First-run setup, step by step: pick a service → sign in (on the service's own page) → read its
// channel guide → play one channel → find how many streams play at once → pick the grid. Everything
// that touches the window comes in through SetupDeps, so the steps are tested with fakes and the
// app (or the --setup-demo mode) supplies the real thing.

export type SetupStep = 'welcome' | 'service' | 'signin' | 'channels' | 'playback' | 'streams' | 'done';

export interface SetupView {
  step: SetupStep;
  provider: ProviderSummary | null;
  signin: SigninStatus | null;
  scan: { found: string[]; missing: string[]; rows: number } | null;
  playback: { channel: string; state: StreamState; detail: string } | null;
  streams: { measured: number; documented: number | null; message: string; perScreen: { screen: number; channel: string; state: string }[] } | null;
  /** What's running right now ("Reading your channel guide…"), or null. */
  busy: string | null;
  error: string | null;
}

/** One video view, as setup uses it. */
export interface SetupScreen {
  tune(ch: ChannelRef): Promise<unknown>;
  health(): Promise<{ state: StreamState; detail: string } | null>;
  release(): Promise<void>;
}

export interface SetupDeps {
  providers(): ProviderSummary[];
  /** Switch the window to this service and start its sign-in. */
  useProvider(id: string): Promise<void>;
  retrySignin(): void;
  /** Read the service's guide on screen 1. */
  discover(): Promise<DiscoveredChannel[]>;
  screens(): SetupScreen[];
  /** The lineup in effect (the saved scan, else the config file). */
  channels(): Config['channels'];
  saveLineup(lineup: Config['channels'], rows: DiscoveredChannel[]): void;
  saveSetup(patch: Partial<SetupState>): void;
  /** Setup is done: switch to the main app with this many screens. */
  finished(screens: number): Promise<void>;
  startupTimeoutMs: number;
  sleep(ms: number): Promise<void>;
  /** Something changed: push the state to the UI. */
  onChange(): void;
}

/** Channels tried for the playback test, best first (most services carry ESPN). */
const TEST_ORDER = ['ESPN', 'ESPN2', 'FS1', 'ABC', 'CBS', 'FOX', 'NBC', 'ESPNU', 'SEC Network', 'ACC Network', 'Big Ten Network', 'CBS Sports Network', 'TNT', 'truTV', 'FS2', 'The CW', 'USA Network', 'ESPNews'];

/** The lineup's carried networks in test order (best first), one per channel. */
export function carriedChannels(channels: Config['channels']): ChannelRef[] {
  const keys = [...TEST_ORDER, ...Object.keys(channels).filter((k) => !TEST_ORDER.includes(k))];
  const out: ChannelRef[] = [];
  for (const k of keys) {
    const n = channels[k]?.number;
    if (n === null || n === undefined) continue;
    const ref = channelRef(channels, n);
    if (ref && !out.some((c) => c.number === n)) out.push({ ...ref, name: k });
  }
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export class SetupRunner {
  private v: SetupView = { step: 'welcome', provider: null, signin: null, scan: null, playback: null, streams: null, busy: null, error: null };

  constructor(private readonly deps: SetupDeps) {}

  view(): SetupView {
    return structuredClone(this.v);
  }

  /** Move between the first screens (welcome → service) or back to an earlier step. */
  go(step: SetupStep): void {
    this.set({ step, error: null });
  }

  async choose(id: string): Promise<void> {
    const provider = this.deps.providers().find((p) => p.id === id);
    if (!provider) return this.set({ error: `unknown service "${id}"` });
    this.set({ step: 'signin', provider, signin: null, scan: null, playback: null, streams: null, error: null, busy: `Opening ${provider.name}…` });
    try {
      await this.deps.useProvider(id);
      this.set({ busy: null });
    } catch (err) {
      this.set({ busy: null, error: message(err) });
    }
  }

  /** Re-run playback and stream tests for a service that's already signed in and scanned (settings page). */
  async resume(id: string): Promise<void> {
    const provider = this.deps.providers().find((p) => p.id === id) ?? null;
    this.set({ provider, signin: { state: 'ok', detail: '' }, scan: null, error: null });
    await this.playTest();
    if (this.v.playback?.state === 'PLAYING') await this.streamTest();
  }

  retrySignin(): void {
    this.set({ step: 'signin', error: null, signin: null });
    this.deps.retrySignin();
  }

  /** Sign-in news from the window. Success moves on by itself: read the guide, then play one channel. */
  async onSignin(s: SigninStatus): Promise<void> {
    if (this.v.step !== 'signin') return;
    this.set({ signin: s, error: s.state === 'failed' ? s.detail : null });
    if (s.state !== 'ok') return;
    await this.scan();
    if (this.v.scan) await this.playTest();
  }

  async scan(): Promise<void> {
    this.set({ step: 'channels', busy: 'Reading your channel guide…', error: null });
    try {
      const rows = await this.deps.discover();
      const { lineup, found, missing } = lineupFromScan(rows);
      if (!found.length) {
        // Never replace a good lineup with an empty one: the guide probably didn't load or its layout changed.
        this.set({ busy: null, scan: null, error: `No sports channels found in the guide (${plural(rows.length, 'row')} read). The guide may not have loaded, or the service changed its page: open Diagnostics.` });
        return;
      }
      this.deps.saveLineup(lineup, rows);
      this.deps.saveSetup({ lineupAt: new Date().toISOString() });
      this.set({ busy: null, scan: { found, missing, rows: rows.length } });
    } catch (err) {
      this.set({ busy: null, error: `Couldn't read the channel guide: ${message(err)}` });
    }
  }

  async playTest(): Promise<void> {
    const channels = this.carried();
    if (!channels.length) return this.set({ step: 'playback', error: 'No channels to test: run the channel scan first.' });
    const ch = channels[0];
    this.set({ step: 'playback', busy: `Playing ${ch.name}…`, error: null, playback: null });
    const screen = this.deps.screens()[0];
    const r = await this.watch(screen, ch);
    this.set({ busy: null, playback: { channel: ch.name, state: r.state, detail: r.detail }, error: r.state === 'PLAYING' ? null : `${ch.name} didn't play: ${r.detail}` });
  }

  /** Add screens one at a time, each on a different channel, until one won't play. */
  async streamTest(): Promise<void> {
    const screens = this.deps.screens();
    const channels = this.carried();
    const documented = this.v.provider?.documentedMaxStreams ?? null;
    const perScreen: { screen: number; channel: string; state: string }[] = [];
    let measured = 0;
    let stopReason = '';
    this.set({ step: 'streams', busy: 'Testing how many streams play at once…', error: null, streams: null });
    if (this.v.playback?.state === 'PLAYING') {
      measured = 1;
      perScreen.push({ screen: 1, channel: this.v.playback.channel, state: 'PLAYING' });
      for (let k = 2; k <= Math.min(4, screens.length); k++) {
        const ch = channels[k - 1];
        if (!ch) {
          stopReason = 'not enough different channels to test more screens';
          break;
        }
        this.set({ busy: `Testing ${plural(k, 'stream')} at once (${ch.name})…` });
        const r = await this.watch(screens[k - 1], ch);
        perScreen.push({ screen: k, channel: ch.name, state: r.state });
        if (r.state !== 'PLAYING') {
          stopReason = r.state === 'STREAM_LIMIT' ? `${this.v.provider?.shortName ?? 'the service'} reported a stream limit` : `${ch.name} on screen ${k} didn't play (${r.detail})`;
          break;
        }
        measured = k;
      }
      for (const s of screens.slice(1)) await s.release().catch(() => {});
    } else {
      stopReason = this.v.playback?.detail ?? 'the playback test did not run';
    }
    const msg = streamsMessage(measured, documented, this.v.provider?.shortName ?? 'The service', stopReason);
    this.set({ busy: null, streams: { measured, documented, message: msg, perScreen } });
    this.deps.saveSetup({ measuredStreams: measured, testedAt: new Date().toISOString() });
  }

  async finish(screens: number): Promise<void> {
    const measured = this.v.streams?.measured ?? 0;
    const n = Math.max(1, Math.min(Math.round(screens) || 1, Math.max(1, measured), 4));
    this.deps.saveSetup({ provider: this.v.provider?.id ?? null, completed: true, screens: n, measuredStreams: measured });
    this.set({ step: 'done', busy: 'Starting RedZone…' });
    await this.deps.finished(n);
    this.set({ busy: null });
  }

  // ---------------------------------------------------------------------------------------------

  private carried(): ChannelRef[] {
    return carriedChannels(this.deps.channels());
  }

  /** Tune a screen and wait (up to the startup timeout) for it to play or to fail for good. */
  private async watch(screen: SetupScreen, ch: ChannelRef): Promise<{ state: StreamState; detail: string }> {
    try {
      await screen.tune(ch);
    } catch (err) {
      return { state: 'UNKNOWN_ERROR', detail: message(err) };
    }
    let last: { state: StreamState; detail: string } = { state: 'NO_VIDEO', detail: 'waiting for the player' };
    const polls = Math.max(1, Math.ceil(this.deps.startupTimeoutMs / 1000));
    for (let i = 0; i < polls; i++) {
      const h = await screen.health().catch(() => null);
      if (h) last = h;
      if (last.state === 'PLAYING' || (ERROR_STATES.has(last.state) && last.state !== 'STALLED')) return last;
      await this.deps.sleep(1000);
    }
    return last.state === 'PLAYING' ? last : { state: last.state === 'BUFFERING' || last.state === 'NO_VIDEO' ? 'STALLED' : last.state, detail: last.detail };
  }

  private set(patch: Partial<SetupView>): void {
    this.v = { ...this.v, ...patch };
    this.deps.onChange();
  }
}

/** The stream test's result in plain words. */
export function streamsMessage(measured: number, documented: number | null, service: string, stopReason: string): string {
  if (measured === 0) return `No video played: ${stopReason}. Campus services usually need the campus network; if you're on it, open Diagnostics.`;
  const doc = documented ? ` (${service} documents ${documented})` : '';
  if (measured >= 4) return `All 4 streams played at once${doc}. RedZone will use 4 screens.`;
  return `Your plan played ${plural(measured, 'stream')} at once${doc}. RedZone will use ${plural(measured, 'screen')}${stopReason ? `; the next one stopped because ${stopReason}` : ''}.`;
}

function message(err: unknown): string {
  return String(err instanceof Error ? err.message : err).split('\n')[0];
}
