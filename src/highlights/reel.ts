import type { HighlightsConfig } from '../config';
import type { GameSnapshot } from '../engine/types';
import type { EspnClip } from './espn';
import type { YouTubeClip } from './youtube';

// Builds the halftime reel. Pure, so the ordering is unit-tested.
//   1. your home game's first-half plays, in order
//   2. recent big plays from other live games: same sport first, then closest games, a few per game, round-robin
//   3. one package per finished game, same sport first, then closest finishes: YouTube official package, else ESPN's
//      package, else its two latest plays
// with a scores-board card every `cardEveryClips` clips (or only cards when there are no clips).

export type ReelItem =
  | { kind: 'espn'; id: string; gameId: string; game: string; title: string; src: string; poster: string | null; durationSec: number }
  | { kind: 'youtube'; id: string; gameId: string; game: string; title: string; videoId: string }
  | { kind: 'card'; id: string; title: string };

export interface ReelInput {
  homeGameId: string | null;
  games: GameSnapshot[];
  clips: Map<string, EspnClip[]>;
  youtube: Map<string, YouTubeClip>;
  now: number;
  opts: Pick<HighlightsConfig, 'cardEveryClips' | 'maxClipsPerLiveGame' | 'recentMinutes' | 'includeHomeGame' | 'espnClips' | 'youtube'>;
}

const label = (g: GameSnapshot) => (g.phase === 'PRE' ? g.shortName : `${g.away.abbr} ${g.away.score}-${g.home.score} ${g.home.abbr}`);
const margin = (g: GameSnapshot) => Math.abs(g.home.score - g.away.score);

function espnItem(c: EspnClip, g: GameSnapshot): ReelItem {
  return { kind: 'espn', id: `espn-${c.id}`, gameId: g.id, game: label(g), title: c.headline, src: c.mp4, poster: c.thumbnail, durationSec: c.durationSec };
}

export function buildReel(input: ReelInput): ReelItem[] {
  const { opts } = input;
  const clipsOf = (id: string) => (opts.espnClips ? (input.clips.get(id) ?? []) : []);
  const byId = new Map(input.games.map((g) => [g.id, g]));
  const clips: ReelItem[] = [];

  // 1. Home game's first half.
  const home = input.homeGameId ? byId.get(input.homeGameId) : undefined;
  if (home && opts.includeHomeGame) {
    for (const c of clipsOf(home.id).filter((c) => c.kind === 'play').sort((a, b) => a.publishedAt - b.publishedAt)) clips.push(espnItem(c, home));
  }

  // 2. Other live games, round-robin by closeness.
  const recentAfter = input.now - opts.recentMinutes * 60_000;
  const sameFirst = (a: GameSnapshot, b: GameSnapshot) => Number(!!home && a.sport !== home.sport) - Number(!!home && b.sport !== home.sport) || margin(a) - margin(b);
  const live = input.games.filter((g) => g.id !== home?.id && (g.phase === 'LIVE' || g.phase === 'HALFTIME')).sort(sameFirst);
  const queues = live.map((g) => ({
    g,
    q: clipsOf(g.id)
      .filter((c) => c.kind === 'play' && c.publishedAt >= recentAfter)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, opts.maxClipsPerLiveGame),
  }));
  for (let round = 0; round < opts.maxClipsPerLiveGame; round++) {
    for (const { g, q } of queues) if (q[round]) clips.push(espnItem(q[round], g));
  }

  // 3. Finished games.
  const finals = input.games.filter((g) => g.id !== home?.id && g.phase === 'FINAL').sort(sameFirst);
  for (const g of finals) {
    const yt = opts.youtube ? input.youtube.get(g.id) : undefined;
    if (yt) {
      clips.push({ kind: 'youtube', id: `yt-${yt.videoId}`, gameId: g.id, game: `Final: ${label(g)}`, title: yt.title, videoId: yt.videoId });
      continue;
    }
    const cs = clipsOf(g.id);
    const pkg = cs.filter((c) => c.kind === 'package').sort((a, b) => b.durationSec - a.durationSec)[0];
    const picks = pkg ? [pkg] : cs.filter((c) => c.kind === 'play').sort((a, b) => a.publishedAt - b.publishedAt).slice(-2);
    for (const c of picks) clips.push({ ...espnItem(c, g), game: `Final: ${label(g)}` } as ReelItem);
  }

  if (!clips.length) return [{ kind: 'card', id: 'card-0', title: 'Scores' }];
  const out: ReelItem[] = [];
  clips.forEach((c, i) => {
    if (i > 0 && i % opts.cardEveryClips === 0) out.push({ kind: 'card', id: `card-${i}`, title: 'Scores' });
    out.push(c);
  });
  return out;
}
