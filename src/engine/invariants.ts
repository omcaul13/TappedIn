import { directorSettings, type Config } from '../config';
import { pickBest } from './director';
import type { Engine, TickResult } from './engine';

// Rules the director must never break, checked after every tick in simulation and in the golden
// replay test:
//  1. No game on two screens at once unless the pick was flagged as the only option.
//  2. No automatic switch within dwellSeconds of the previous switch on that screen.
//  3. Every decision has a rule and at least one reason.
//  4. Screens only tune to channels in your lineup.
//  5. Fill-ins only happen while that screen's home game is in a break.
//  6. A fill-in comes from the best tier that had a game: same sport, then a sport another screen is
//     watching, then any sport.

export class InvariantChecker {
  readonly violations: string[] = [];
  private lastSwitch = new Map<number, number>();
  private duplicateOk = new Map<number, string>();
  private readonly lineup: Set<number>;
  private readonly maxBreakRisk: number | undefined;

  constructor(private readonly cfg: Config) {
    this.maxBreakRisk = directorSettings(cfg).candidateMaxBreakRisk;
    this.lineup = new Set(Object.values(cfg.channels).flatMap((c) => (c.number === null ? [] : [c.number])));
  }

  check(engine: Engine, res: TickResult, now: number): void {
    const fail = (msg: string) => this.violations.push(`${new Date(now).toISOString()} ${msg}`);
    for (const d of res.decisions) {
      if (!d.rule || !d.reasons.length || d.reasons.some((r) => !r)) fail(`S${d.screen} decision without a reason: ${JSON.stringify(d)}`);
      if (!d.switched) continue;
      const prev = this.lastSwitch.get(d.screen);
      const isFirst = d.rule === 'HOME_SYNC' || prev === undefined;
      if (d.auto && !isFirst && now - prev! < this.cfg.director.dwellSeconds * 1000) fail(`S${d.screen} ${d.rule} only ${((now - prev!) / 1000).toFixed(0)}s after previous switch`);
      this.lastSwitch.set(d.screen, now);
      if (d.duplicate && d.gameId) this.duplicateOk.set(d.screen, d.gameId);
      else this.duplicateOk.delete(d.screen);
      if (['BREAK_FILL', 'FILL_REPLACE', 'FILL_UPGRADE'].includes(d.rule)) {
        const home = engine.director.screens.find((s) => s.id === d.screen)?.homeGameId;
        const st = home ? engine.assessment(home)?.state : undefined;
        if (st !== 'BREAK') fail(`S${d.screen} ${d.rule} while home is ${st}`);
        if (d.tier && !d.duplicate) {
          const sc = engine.director.screens.find((s) => s.id === d.screen)!;
          const { ranked } = pickBest(engine.director.screens, sc, engine.views(), [], this.maxBreakRisk);
          const best = Math.min(...ranked.filter((c) => !c.shownElsewhere).map((c) => c.tier));
          if (best < d.tier) fail(`S${d.screen} ${d.rule} picked a tier-${d.tier} game while a tier-${best} game was available`);
        }
      }
    }
    for (const c of res.commands) if (c.type === 'tune' && !this.lineup.has(c.channel)) fail(`S${c.screen} tuned to channel ${c.channel}, not in lineup`);

    const byGame = new Map<string, number[]>();
    for (const sc of engine.director.screens) {
      if (sc.showing.kind !== 'game') continue;
      byGame.set(sc.showing.gameId, [...(byGame.get(sc.showing.gameId) ?? []), sc.id]);
    }
    for (const [game, screens] of byGame) {
      if (screens.length < 2) continue;
      if (!screens.some((s) => this.duplicateOk.get(s) === game)) fail(`game ${game} on screens ${screens.join(', ')} without being the only option`);
    }
  }
}
