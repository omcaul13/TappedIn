import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';

// Stream health: probe every frame of a tile window, then classify what the viewer is seeing.
// Text-based error detection only counts when the video is NOT progressing, because pages often
// contain words like "Sign in" in menus while playing fine.

const INJECT_DIR = path.join(import.meta.dirname, 'inject');
export const PROBE_JS = readFileSync(path.join(INJECT_DIR, 'probe.js'), 'utf8');
export const BADGE_JS = readFileSync(path.join(INJECT_DIR, 'badge.js'), 'utf8');
export const WIDEVINE_JS = readFileSync(path.join(INJECT_DIR, 'widevine.js'), 'utf8');

export interface VideoProbe {
  rect: { x: number; y: number; w: number; h: number };
  videoW: number;
  videoH: number;
  currentTime: number;
  readyState: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  hasMediaKeys: boolean;
  error: { code: number; message: string } | null;
  src: string;
}

export interface FrameProbe {
  url: string;
  title: string;
  isTop: boolean;
  webdriver: boolean;
  visibility: string;
  fullscreen: boolean;
  viewport: { w: number; h: number };
  videos: VideoProbe[];
  largestVideoAncestors: string[];
  errorMatches: string[];
  errorLines: string[];
  /** Our overlay is present in this frame (re-injected after full page loads). */
  overlay?: boolean;
}

export type StreamState =
  | 'NO_VIDEO'
  | 'BUFFERING'
  | 'PLAYING'
  | 'PAUSED'
  | 'IDLE_PROMPT'
  | 'STALLED'
  | 'LOGIN_REQUIRED'
  | 'STREAM_LIMIT'
  | 'CHANNEL_UNAVAILABLE'
  | 'DRM_ERROR'
  | 'MEDIA_ERROR'
  | 'UNKNOWN_ERROR';

export const ERROR_STATES: ReadonlySet<StreamState> = new Set(['LOGIN_REQUIRED', 'STREAM_LIMIT', 'CHANNEL_UNAVAILABLE', 'DRM_ERROR', 'MEDIA_ERROR', 'UNKNOWN_ERROR', 'STALLED']);

export interface Health {
  state: StreamState;
  detail: string;
  video: VideoProbe | null;
  frames: number;
}

export async function probePage(page: Page): Promise<FrameProbe[]> {
  const out: FrameProbe[] = [];
  for (const frame of page.frames()) {
    try {
      out.push((await frame.evaluate(PROBE_JS)) as FrameProbe);
    } catch {
      // Frame navigated or detached mid-probe; skip it this round.
    }
  }
  return out;
}

const LOGIN_URL = /(login|signin|sign-in|oauth|sso|idp|saml|shibboleth|microsoftonline|okta|duosecurity|auth\.)/i;
const LIMIT = /(maximum number of|too many|limit|already (watching|streaming))/i;
const UNAVAILABLE = /(not available|only available|outside|not authorized|not entitled)/i;
const LOGIN_TEXT = /(sign in|log in|session)/i;
const IDLE_PROMPT = /still (watching|there)/i;

export interface HealthTimeouts {
  /** Before the first PLAYING after a tune. */
  startupSeconds: number;
  /** After it has played. */
  stallSeconds: number;
}

export class HealthTracker {
  private history: { t: number; ct: number }[] = [];
  private lastProgressAt = Date.now();
  private played = false;
  private readonly timeouts: HealthTimeouts;

  constructor(timeouts: HealthTimeouts | number = 12) {
    this.timeouts = typeof timeouts === 'number' ? { startupSeconds: timeouts, stallSeconds: timeouts } : timeouts;
  }

  /** Call right after a tune: restarts the startup clock. */
  reset(now = Date.now()): void {
    this.history = [];
    this.lastProgressAt = now;
    this.played = false;
  }

  get hasPlayed(): boolean {
    return this.played;
  }

  update(frames: FrameProbe[], now = Date.now()): Health {
    const all = frames.flatMap((f) => f.videos);
    const video = all.reduce<VideoProbe | null>((best, v) => (!best || v.rect.w * v.rect.h > best.rect.w * best.rect.h ? v : best), null);
    const top = frames.find((f) => f.isTop) ?? frames[0];

    if (video) {
      this.history.push({ t: now, ct: video.currentTime });
      this.history = this.history.filter((h) => now - h.t <= 4000);
    }
    const oldest = this.history[0];
    const advanced = video && oldest && now - oldest.t >= 1500 ? video.currentTime - oldest.ct : 0;
    const progressing = advanced >= 1.0;
    if (progressing) this.lastProgressAt = now;

    if (progressing && video && !video.paused) {
      this.played = true;
      return { state: 'PLAYING', detail: `+${advanced.toFixed(1)}s`, video, frames: frames.length };
    }

    if (top && LOGIN_URL.test(safeHost(top.url) + new URL(top.url, 'http://x').pathname)) {
      return { state: 'LOGIN_REQUIRED', detail: `redirected to ${top.url.slice(0, 80)}`, video, frames: frames.length };
    }
    const lines = frames.flatMap((f) => f.errorLines);
    const joined = lines.join(' | ');
    if (video?.error) {
      const drm = /drm|key|license|cdm|widevine/i.test(video.error.message);
      return { state: drm ? 'DRM_ERROR' : 'MEDIA_ERROR', detail: `video error ${video.error.code}: ${video.error.message}`, video, frames: frames.length };
    }
    if (lines.some((l) => IDLE_PROMPT.test(l))) return { state: 'IDLE_PROMPT', detail: joined, video, frames: frames.length };
    if (lines.some((l) => LIMIT.test(l))) return { state: 'STREAM_LIMIT', detail: joined, video, frames: frames.length };
    if (lines.some((l) => UNAVAILABLE.test(l))) return { state: 'CHANNEL_UNAVAILABLE', detail: joined, video, frames: frames.length };
    if (!video && lines.some((l) => LOGIN_TEXT.test(l))) return { state: 'LOGIN_REQUIRED', detail: joined, video, frames: frames.length };

    const stalledFor = (now - this.lastProgressAt) / 1000;
    if (stalledFor >= (this.played ? this.timeouts.stallSeconds : this.timeouts.startupSeconds)) {
      const why = lines.length ? joined : video ? `no progress for ${stalledFor.toFixed(0)}s (readyState ${video.readyState}, paused ${video.paused})` : `no <video> after ${stalledFor.toFixed(0)}s`;
      return { state: lines.length ? 'UNKNOWN_ERROR' : 'STALLED', detail: why, video, frames: frames.length };
    }
    if (!video) return { state: 'NO_VIDEO', detail: 'waiting for player', video, frames: frames.length };
    if (video.paused) return { state: 'PAUSED', detail: `readyState ${video.readyState}`, video, frames: frames.length };
    return { state: 'BUFFERING', detail: `readyState ${video.readyState}`, video, frames: frames.length };
  }
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

export async function setMuted(page: Page, muted: boolean): Promise<void> {
  const js = `(() => { const vs = []; const walk = (r) => { for (const v of r.querySelectorAll('video')) vs.push(v); for (const el of r.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); }; walk(document); for (const v of vs) v.muted = ${muted}; return vs.length; })()`;
  for (const frame of page.frames()) {
    try {
      await frame.evaluate(js);
    } catch {
      /* detached frame */
    }
  }
}
