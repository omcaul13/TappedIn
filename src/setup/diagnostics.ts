import { matchLineup } from '../providers/networks';
import type { DiscoveredChannel, ProviderConfig } from '../providers/types';
import type { StreamState } from '../windows/health';
import { lineupFromScan } from './lineupEdit';

// Diagnostics for an adapter (mainly the experimental ones): run each part on its own, see what it
// saw, fix the config values involved, run it again. Each step gets what it needs through DiagDeps,
// so the rules here are unit-tested and the app supplies the real window.

export type DiagStep = 'signin' | 'scan' | 'tune' | 'playback' | 'hide';
export const DIAG_STEPS: DiagStep[] = ['signin', 'scan', 'tune', 'playback', 'hide'];

export interface DiagResult {
  step: DiagStep;
  pass: boolean;
  summary: string;
  /** What the step saw (URLs here are reduced to site + path before export). */
  facts: Record<string, string | number | boolean>;
  /** Config paths a user can edit to fix this step. */
  fields: string[];
}

export interface HideProbe {
  onPlayer: boolean;
  hideClass: boolean;
  video: { w: number; h: number; visible: boolean } | null;
  viewport: { w: number; h: number };
}

export interface DiagDeps {
  config: ProviderConfig;
  signinCheck(): Promise<{ url: string; isApp: boolean; signedOut: boolean }>;
  discover(): Promise<DiscoveredChannel[]>;
  /** Tune screen 1 to the first carried channel. */
  tune(): Promise<{ path: string; ms: number; url: string; onChannel: boolean; channel?: string }>;
  /** Watch screen 1 until it plays or fails for good. */
  watch(): Promise<{ state: StreamState; detail: string }>;
  hideProbe(): Promise<HideProbe>;
}

/** The video fills the view: on the player, the hide class on, and the visible video at least 90% of the view's width or height. */
export function evaluateHide(p: HideProbe): { pass: boolean; why: string } {
  if (!p.onPlayer) return { pass: false, why: "the page isn't the player (shell.playerUrl doesn't match its address)" };
  if (!p.hideClass) return { pass: false, why: "the hide script didn't run (shell.appUrl may not match the page)" };
  if (!p.video) return { pass: false, why: 'no video found on the page' };
  if (!p.video.visible) return { pass: false, why: 'the video is hidden; the page may draw it in a way the hide script misses' };
  const fill = Math.max(p.video.w / p.viewport.w, p.video.h / p.viewport.h);
  if (fill < 0.9) return { pass: false, why: `the video is too small (${Math.round(fill * 100)}% of the view); try shell.hideCss` };
  return { pass: true, why: `the video fills ${Math.round(fill * 100)}% of the view` };
}

/** Config paths shown for editing at each step (they all exist in that provider's config). */
export function fieldsFor(step: DiagStep, c: ProviderConfig): string[] {
  const t = c.tuning as Record<string, unknown>;
  const lineup = (t.lineup ?? {}) as Record<string, unknown>;
  const candidates: Record<DiagStep, string[]> = {
    signin: ['signin.checkUrl', 'signin.signedOutPattern', 'shell.appUrl', 'signin.startUrl'],
    scan:
      c.family === 'comcast'
        ? ['tuning.listingsUrl', 'tuning.channelMapResponse', 'tuning.channelNumber', 'tuning.row']
        : lineup.mode === 'response'
          ? ['tuning.lineup.guideUrl', 'tuning.lineup.responseUrl', 'tuning.lineup.items', 'tuning.lineup.ref', 'tuning.lineup.label', 'tuning.lineup.refPattern', 'tuning.lineup.scrollContainer']
          : ['tuning.lineup.guideUrl', 'tuning.lineup.row', 'tuning.lineup.ref.selector', 'tuning.lineup.ref.attr', 'tuning.lineup.ref.pattern', 'tuning.lineup.label.attr', 'tuning.lineup.label.pattern'],
    tune: c.family === 'comcast' ? ['tuning.listingsUrl', 'tuning.livePath', 'tuning.rowButton', 'tuning.closePlayer', 'tuning.callSignInUrl'] : ['tuning.watchUrl', 'tuning.refInUrl'],
    playback: ['shell.playerUrl', 'errors.limit', 'errors.unavailable', 'errors.loginText'],
    hide: ['shell.playerUrl', 'shell.appUrl', 'shell.hideCss'],
  };
  return candidates[step].filter((f) => getPath(c, f) !== undefined);
}

/** Value at a dotted path ("tuning.lineup.ref.attr"). */
export function getPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const k of dotted.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export async function runStep(step: DiagStep, d: DiagDeps): Promise<DiagResult> {
  const fields = fieldsFor(step, d.config);
  const result = (pass: boolean, summary: string, facts: DiagResult['facts'] = {}): DiagResult => ({ step, pass, summary, facts, fields });
  try {
    switch (step) {
      case 'signin': {
        const r = await d.signinCheck();
        if (!r.isApp) return result(false, `The check page didn't reach ${d.config.name}; it ended at ${r.url}.`, r);
        if (r.signedOut) return result(false, `${d.config.name} looks signed out (its page matches signin.signedOutPattern).`, r);
        return result(true, `Signed in: the check page is ${d.config.name} and doesn't look signed out.`, r);
      }
      case 'scan': {
        const rows = await d.discover();
        const { found, missing } = lineupFromScan(rows);
        const sample = rows.slice(0, 5).map((r) => r.label).join(', ');
        if (!found.length) return result(false, `Read ${rows.length} guide rows but matched no college-football network.`, { rows: rows.length, sample });
        const lineup = matchLineup(rows);
        return result(true, `Read ${rows.length} guide rows; found ${found.join(', ')}.`, { rows: rows.length, found: found.length, missing: missing.join(', '), withIds: Object.values(lineup).filter((e) => e.number !== null && (e.ref || e.callSign)).length, sample });
      }
      case 'tune': {
        const r = await d.tune();
        const facts = { path: r.path, seconds: +(r.ms / 1000).toFixed(1), url: r.url, ...(r.channel ? { channel: r.channel } : {}) };
        return r.onChannel ? result(true, `Tuned ${r.channel ?? 'the channel'} via ${r.path} in ${facts.seconds}s.`, facts) : result(false, `The page didn't land on ${r.channel ?? 'the channel'}.`, facts);
      }
      case 'playback': {
        const r = await d.watch();
        return r.state === 'PLAYING' ? result(true, 'The video is playing.', r) : result(false, `Not playing: ${r.state} (${r.detail}).`, r);
      }
      case 'hide': {
        const p = await d.hideProbe();
        const e = evaluateHide(p);
        return result(e.pass, e.why, { onPlayer: p.onPlayer, hideClass: p.hideClass, videoW: p.video?.w ?? 0, videoH: p.video?.h ?? 0, viewW: p.viewport.w, viewH: p.viewport.h });
      }
    }
  } catch (err) {
    return result(false, `Failed: ${String(err instanceof Error ? err.message : err).split('\n')[0]}`);
  }
}

/** Runs in the player page: is the hide script on, and how big is the visible playing video? */
export const HIDE_PROBE_JS = (playerSource: string, playerFlags: string) => `(() => {
  const vids = [];
  const walk = (r) => { for (const v of r.querySelectorAll('video')) vids.push(v); for (const el of r.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); };
  walk(document);
  const playing = vids.filter((v) => !v.paused && v.readyState >= 2);
  const v = (playing.length ? playing : vids).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  let video = null;
  if (v) {
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth || r.width, vh = v.videoHeight || r.height;
    const scale = Math.min(r.width / vw, r.height / vh) || 0;
    video = { w: Math.round(vw * scale), h: Math.round(vh * scale), visible: getComputedStyle(v).visibility === 'visible' && r.width > 0 && r.height > 0 };
  }
  return { onPlayer: new RegExp(${JSON.stringify(playerSource)}, ${JSON.stringify(playerFlags)}).test(location.href), hideClass: document.documentElement.classList.contains('rz-hide'), video, viewport: { w: innerWidth, h: innerHeight } };
})()`;
