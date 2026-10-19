import type { GameSnapshot, PlaySnap, SportId } from '../engine/types';
import { sportOf } from '../sports';
import type { SynthAdapter, SynthGame } from '../sports/synth/types';

// Rebuild a game day from finished games' play-by-play (every play has a wallclock), so the director
// can be replayed against any past day, not just days we recorded live. Mixed-sport days work: each
// game is rebuilt by its sport's synthesizer (src/sports/synth/).
// Lower fidelity than a real recording: no ESPN lag quirks, no timeout counters, and play-by-play is
// "available" for every game. A play becomes visible dataDelaySeconds after its wallclock.

export type SynthEvent = { at: number; kind: 'snapshots'; snaps: GameSnapshot[] } | { at: number; kind: 'plays'; gameId: string; plays: PlaySnap[] };

export interface SynthOptions {
  dataDelaySeconds: number;
  scoreboardEverySeconds?: number;
  summaryEverySeconds?: number;
}

/** A final summary to rebuild, and its sport (records made before multi-sport are college football). */
export interface SynthInput {
  body: unknown;
  sport?: SportId;
}

/** Generate scoreboard snapshots and play-by-play for a whole day, in time order. */
export function* synthesizeDay(finals: (SynthInput | unknown)[], opts: SynthOptions): Generator<SynthEvent> {
  const inputs = finals.map((f): SynthInput => (f && typeof f === 'object' && 'body' in f ? (f as SynthInput) : { body: f }));
  const adapters = new Map<SynthGame, SynthAdapter>();
  const games: SynthGame[] = [];
  for (const f of inputs) {
    const adapter = sportOf(f.sport).synth;
    const g = adapter?.prepare(f.body, sportOf(f.sport).id);
    if (!adapter || !g) continue;
    games.push(g);
    adapters.set(g, adapter);
  }
  if (!games.length) return;
  const delayMs = opts.dataDelaySeconds * 1000;
  const sbEvery = (opts.scoreboardEverySeconds ?? 12) * 1000;
  const pbpEvery = (opts.summaryEverySeconds ?? 15) * 1000;
  const startAt = Math.min(...games.map((g) => g.start)) - 5 * 60_000;
  const endAt = Math.max(...games.map((g) => g.plays.at(-1)!.wallclock!)) + delayMs + 5 * 60_000;
  const visible = new Map(games.map((g) => [g.id, 0]));
  let nextPbp = startAt;

  for (let t = startAt; t <= endAt; t += sbEvery) {
    for (const g of games) {
      let v = visible.get(g.id)!;
      while (v < g.plays.length && g.plays[v].wallclock! <= t - delayMs) v++;
      visible.set(g.id, v);
    }
    yield { at: t, kind: 'snapshots', snaps: games.map((g) => adapters.get(g)!.snapshot(g, visible.get(g.id)!, t, delayMs)) };
    if (t >= nextPbp) {
      nextPbp = t + pbpEvery;
      for (const g of games) {
        const v = visible.get(g.id)!;
        if (v > 0 && v <= g.plays.length && t - delayMs <= g.plays.at(-1)!.wallclock! + 180_000) yield { at: t, kind: 'plays', gameId: g.id, plays: g.plays.slice(0, v) };
      }
    }
  }
}
