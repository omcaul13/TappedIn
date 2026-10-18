// ESPN highlight clips from the summary endpoint's `videos[]` (direct MP4s on ESPN's CDN).
// Observed 10/17/2026: 25 of 30 finished games had clips, ~8 each, 9-40 s plays plus some talk
// segments (press conferences, injury updates) that don't belong in a highlights reel.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClipKind = 'play' | 'package' | 'talk';

export interface EspnClip {
  id: string;
  gameId: string;
  headline: string;
  durationSec: number;
  mp4: string;
  thumbnail: string | null;
  publishedAt: number;
  kind: ClipKind;
}

const PLAY = /\b(touchdowns?|td|pick-?six|intercept(s|ion|ed)?|picks? off|int\b|fumbles?|scoops?|sacks?|field goal|fg|catch(es)?|grabs?|hauls? in|runs?|rush(es)?|scrambles?|throws?|tosses|finds|connects|scores?|returns?|blocks?|blocked|safety|go-ahead|game-winning|walk-off|hail mary|one-handed|breaks? (free|loose)|takes? it|house|end zone|conversion|2-point|stop|stuffed|denied)\b/i;
const PACKAGE = /\b(highlights?|recap|top plays|best plays)\b/i;
const TALK = /\b(press conference|presser|interview|says|said|reacts?|discuss(es)?|explains?|estimates?|talks?|breaks? down|analysis|preview|what's next|update|on (his|the|their)|weighs in|believes|addresses|postgame)\b/i;

export function classifyClip(headline: string, durationSec: number): ClipKind {
  if (PACKAGE.test(headline) && durationSec >= 60) return 'package';
  if (TALK.test(headline) && !PLAY.test(headline)) return 'talk';
  if (PLAY.test(headline)) return 'play';
  return durationSec <= 60 ? 'play' : 'talk';
}

/** Playable clips from a summary body (desktop allowed, not embargoed, has an MP4). */
export function parseEspnVideos(body: any, gameId: string, now = Date.now()): EspnClip[] {
  const out: EspnClip[] = [];
  for (const v of Array.isArray(body?.videos) ? body.videos : []) {
    const mp4: unknown = v?.links?.source?.HD?.href ?? v?.links?.source?.href;
    if (typeof mp4 !== 'string' || !/\.mp4(\?|$)/i.test(mp4)) continue;
    const devices: unknown = v?.deviceRestrictions?.devices;
    if (Array.isArray(devices) && v?.deviceRestrictions?.type === 'whitelist' && !devices.includes('desktop')) continue;
    const embargo = Date.parse(v?.timeRestrictions?.embargoDate ?? '');
    if (Number.isFinite(embargo) && embargo > now) continue;
    const headline = String(v?.headline ?? v?.description ?? '').trim();
    const durationSec = Number(v?.duration) || 0;
    out.push({
      id: String(v?.id ?? mp4),
      gameId,
      headline,
      durationSec,
      mp4,
      thumbnail: typeof v?.thumbnail === 'string' ? v.thumbnail : null,
      publishedAt: Date.parse(v?.originalPublishDate ?? v?.lastModified ?? '') || 0,
      kind: classifyClip(headline, durationSec),
    });
  }
  return out;
}
