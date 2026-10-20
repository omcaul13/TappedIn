import { useEffect, useRef, useState } from 'preact/hooks';
import { SportIcon } from '../icons';
import type { AppState, GameDTO } from '../util';
import { PickMenu } from './BigTicker';
import { compactLine, miniScopeOf, tickerGames, tickerSections, type TickerAlert, type TickerAlerts } from './model';

// The mini ticker: one game at a time next to the clock, rotating every few seconds with a slide. When
// something happens in a game it covers (a score, red zone, match point…) it jumps there for a few
// seconds, then goes back to rotating. Same model and wording as the big ticker, on one line.

const JUMP_MS = 8000;

export function MiniTicker({ st, alerts, fresh }: { st: AppState; alerts: TickerAlerts; fresh: TickerAlert[] }) {
  const t = st.settings.ticker;
  const games = tickerSections(tickerGames(st, miniScopeOf(t)), st.sports.map((s) => s.id), { cfbTop25: t.cfbTop25 }).flatMap((s) => s.games);
  const [i, setI] = useState(0);
  const [jump, setJump] = useState<{ id: string; until: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [pick, setPick] = useState<{ game: GameDTO; x: number } | null>(null);
  const queue = useRef<string[]>([]);

  // New alerts in games this ticker covers: jump to them, one at a time.
  useEffect(() => {
    const ids = new Set(games.map((g) => g.id));
    for (const a of fresh) if (ids.has(a.gameId) && !queue.current.includes(a.gameId)) queue.current.push(a.gameId);
    // Jump right away unless you're reading it or it's already showing an alert.
    if (!hover && !(jump && Date.now() < jump.until) && queue.current.length) setJump({ id: queue.current.shift()!, until: Date.now() + JUMP_MS });
  }, [fresh]);

  useEffect(() => {
    const step = setInterval(
      () => {
        if (hover) return;
        const now = Date.now();
        if (jump && now < jump.until) return;
        const next = queue.current.shift();
        if (next) {
          setJump({ id: next, until: now + JUMP_MS });
          return;
        }
        if (jump) setJump(null);
        setI((x) => x + 1);
      },
      Math.max(1, t.miniIntervalSeconds) * 1000,
    );
    return () => clearInterval(step);
  }, [hover, jump, t.miniIntervalSeconds]);

  if (!games.length) return null;
  const g = (jump && games.find((x) => x.id === jump.id)) || games[i % games.length];
  const alert = alerts.active(g.id, Date.now());
  return (
    <>
      <span class={`mini-ticker${alert ? ' alert' : ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={(e) => setPick({ game: g, x: e.clientX })} title={`${g.name}: click to put it on a screen`}>
        <span class="mt-line" key={`${g.id}|${alert?.label ?? ''}`}>
          <SportIcon family={g.family} />
          <span class="mt-text">{compactLine(g, alert)}</span>
        </span>
      </span>
      {pick && <PickMenu st={st} game={pick.game} at={{ x: pick.x, y: 40 }} onClose={() => setPick(null)} />}
    </>
  );
}
