import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import type { WindowsConfig } from '../config';
import type { ChannelRef, TuneOutcome } from '../providers/types';
import { errorRules, HealthTracker, probePage, setMuted, type ErrorRules, type Health } from './health';
import type { Tuner } from './tuner';

// One tile window: what it renders, its stream health, its sound, its overlay and its hotkeys.

const OVERLAY_JS = readFileSync(path.join(import.meta.dirname, 'inject', 'overlay.js'), 'utf8');
const HOTKEYS_JS = readFileSync(path.join(import.meta.dirname, 'inject', 'hotkeys.js'), 'utf8');

export type Render = 'none' | 'video' | 'local';
export type Tone = 'live' | 'break' | 'halftime' | 'final' | 'error' | 'data' | 'idle';

export interface PopupGame {
  id: string;
  label: string;
  detail: string;
}

/** Game-over pop-up: pick the screen's next home game. */
export interface Popup {
  title: string;
  live: PopupGame[];
  later: PopupGame[];
  /** Milliseconds until the auto-pick, or null when you said "Not now". */
  autoPickInMs: number | null;
}

export interface OverlayState {
  badge: { text: string; tone: Tone } | null;
  error: { title: string; detail: string; hint: string } | null;
  popup: Popup | null;
}

/** Messages from a tile page to the app (hotkeys, pop-up clicks). */
export type BridgeMessage = { type: 'hotkey'; key: string } | { type: 'pick'; gameId: string } | { type: 'keep' };

export class ScreenWindow {
  render: Render = 'none';
  channel: number | null = null;
  localUrl: string | null = null;
  lastTune: TuneOutcome | null = null;
  lastHealth: Health | null = null;
  /** False when the pop-up couldn't be drawn over the player (fullscreen etc.). */
  popupVisible = true;
  readonly tracker: HealthTracker;
  private readonly rules: ErrorRules;
  private wantMuted = true;
  private overlay: OverlayState = { badge: null, error: null, popup: null };
  private overlayDrawn = '';
  private bridged = false;

  constructor(
    /** The screen this view serves (a standby view moves between screens). */
    public id: number,
    readonly page: Page,
    private readonly tuner: Tuner,
    cfg: WindowsConfig,
    /** Chrome tiles draw badges and pop-ups inside the page; the one-window app draws them in its own UI. */
    private readonly inPageUi = true,
    /** The app window's name for this view (S1..S4, X1..), when it has one. */
    readonly viewName: string | null = null,
  ) {
    this.rules = errorRules(tuner.adapter.config);
    this.tracker = new HealthTracker({ startupSeconds: cfg.startupTimeoutSeconds, stallSeconds: cfg.stallSeconds }, this.rules);
  }

  /** Hotkeys + pop-up clicks reach the app through a page binding (survives navigations). */
  async installBridge(onMessage: (msg: BridgeMessage) => void): Promise<void> {
    if (this.bridged) return;
    this.bridged = true;
    await this.page.exposeBinding('rzCall', (_source, msg: BridgeMessage) => onMessage(msg));
    await this.page.addInitScript(HOTKEYS_JS);
    await this.page.evaluate(HOTKEYS_JS).catch(() => {});
  }

  /** The lineup channel this screen should be on (its call sign / service id let drift be spotted). */
  ref: ChannelRef | null = null;

  async tuneChannel(ch: ChannelRef): Promise<TuneOutcome> {
    let out: TuneOutcome;
    try {
      out = await this.tuner.tune(this.page, ch);
    } catch (err) {
      // The page may already be on the service (it navigated, then the tune failed): treat it as video, on
      // no known channel, so health checks, muting and the next showLocal() see what is really there.
      this.render = 'video';
      this.channel = null;
      this.ref = null;
      this.localUrl = null;
      throw err;
    }
    this.render = 'video';
    this.channel = ch.number;
    this.ref = ch;
    this.localUrl = null;
    this.lastTune = out;
    this.lastHealth = null;
    this.tracker.reset();
    this.overlayDrawn = '';
    await this.drawOverlay();
    return out;
  }

  /** The largest video on the page right now, or undefined. */
  private async largestVideo() {
    try {
      return (await probePage(this.page, this.rules.probePatterns)).flatMap((f) => f.videos).sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
    } catch {
      return undefined;
    }
  }

  /** Source of the largest video right now (to recognise a *new* stream after a tune). */
  async currentSrc(): Promise<string | null> {
    return (await this.largestVideo())?.src || null;
  }

  /**
   * Watch a freshly tuned stream closely (every 250 ms) until a new video is playing, for the switch
   * timeline. Stops early if `stillCurrent()` turns false (another tune superseded this one).
   */
  async watchStart(beforeSrc: string | null, timeoutMs: number, stillCurrent: () => boolean): Promise<{ firstFrameAt: number | null; playingAt: number | null; outcome: 'playing' | 'timeout' | 'superseded' }> {
    const until = Date.now() + timeoutMs;
    let firstFrameAt: number | null = null;
    let lastCt: number | null = null;
    while (Date.now() < until) {
      if (!stillCurrent()) return { firstFrameAt, playingAt: null, outcome: 'superseded' };
      const v = await this.largestVideo();
      if (v && v.src && v.src !== beforeSrc) {
        if (firstFrameAt === null && v.readyState >= 2) firstFrameAt = Date.now();
        if (lastCt !== null && v.currentTime > lastCt + 0.2 && !v.paused) return { firstFrameAt: firstFrameAt ?? Date.now(), playingAt: Date.now(), outcome: 'playing' };
        if (v.readyState >= 2) lastCt = v.currentTime;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { firstFrameAt, playingAt: null, outcome: 'timeout' };
  }

  /** Stop this view's stream but keep the service's app loaded (its guide), ready for a quick in-app tune. */
  async release(): Promise<void> {
    await this.setMuted(true);
    const back = await this.tuner.adapter.release(this.page).catch(() => false);
    if (!back) await this.page.goto('about:blank').catch(() => {});
    this.render = 'none';
    this.channel = null;
    this.ref = null;
    this.localUrl = null;
    this.lastHealth = null;
    this.tracker.reset();
  }

  async showLocal(url: string): Promise<void> {
    if (this.render === 'local' && this.localUrl === url) return;
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    this.render = 'local';
    this.channel = null;
    this.ref = null;
    this.localUrl = url;
    this.lastHealth = null;
    this.overlayDrawn = '';
  }

  /** Probe the stream (video tiles only), keep sound and overlay in the wanted state. */
  async checkHealth(): Promise<Health | null> {
    if (this.render !== 'video') return null;
    const frames = await probePage(this.page, this.rules.probePatterns);
    const h = this.tracker.update(frames);
    this.lastHealth = h;
    if (h.video && h.video.muted !== this.wantMuted) await setMuted(this.page, this.wantMuted);
    if (h.state === 'IDLE_PROMPT') await this.tuner.adapter.answerIdlePrompt(this.page);
    if (h.state === 'PAUSED') await this.page.evaluate(`document.querySelectorAll('video').forEach((v) => v.paused && v.play().catch(() => {}))`).catch(() => {});
    if (!frames.some((f) => f.overlay)) this.overlayDrawn = '';
    await this.drawOverlay();
    return h;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.wantMuted = muted;
    if (this.render === 'video') await setMuted(this.page, muted).catch(() => {});
  }

  get muted(): boolean {
    return this.wantMuted;
  }

  async setOverlay(state: OverlayState): Promise<void> {
    this.overlay = state;
    await this.drawOverlay();
  }

  /** Overlays only go on video tiles; local pages draw their own UI. */
  private async drawOverlay(): Promise<void> {
    if (this.render !== 'video' || !this.inPageUi) return;
    const key = JSON.stringify(this.overlay);
    if (key === this.overlayDrawn) return;
    try {
      const r = (await this.page.evaluate(`(${OVERLAY_JS})(${key})`)) as { popupVisible: boolean };
      this.popupVisible = !this.overlay.popup || r.popupVisible;
      this.overlayDrawn = key;
    } catch {
      // Page mid-navigation; the next health check redraws it.
    }
  }
}
