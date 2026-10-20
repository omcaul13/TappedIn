import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { FullscreenIcon, GearIcon, LockIcon, SportIcon, TickerIcon } from '../icons';
import { act, post, type AppState, type GameDTO, type TeamDTO } from '../util';
import css from './ticker.css';
import { formatCard, tickerGames, tickerSections, type TickerAlerts, type TickerCard, type TickerSection } from './model';

// The big ticker: your CFB ticker built into the app window, across the top (it covers the top bar,
// whose clock, status and controls move into its label block and right-hand column). It scrolls when
// the games don't fit and sits still when they do; hover pauses, Space pauses, ←/→ change the speed.
// Every sport, grouped by sport. Clicking a game offers to put it on a screen.

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/** A team color that stays visible on the dark bar (the original ticker's rule). */
export function stripeColor(t: TeamDTO): string {
  const lum = (hex: string | null | undefined) => {
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return 0;
    const n = parseInt(hex, 16);
    const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  };
  if (lum(t.color) > 0.045) return `#${t.color}`;
  if (lum(t.altColor) > 0.045) return `#${t.altColor}`;
  return '#5f6c80';
}

function TeamLogo({ t }: { t: TeamDTO }) {
  const [bad, setBad] = useState(false);
  return (
    <span class="lg" style={!t.logo || bad ? { background: stripeColor(t) } : undefined}>
      {t.logo && !bad ? <img alt="" decoding="async" src={t.logo} onError={() => setBad(true)} /> : <b>{t.abbr.slice(0, 1)}</b>}
    </span>
  );
}

function Card({ c, onPick }: { c: TickerCard; onPick(e: MouseEvent): void }) {
  return (
    <div class={`card ${c.bucket} ${c.family}${c.tone === 'hot' && c.family === 'football' ? ' rz' : ''}${c.hot ? ' hotcard' : ''}`} title={c.title} onClick={onPick}>
      <div class="teams">
        {c.rows.map((r) => (
          <div class={`row${r.poss ? ' poss' : ''}${r.lose ? ' lose' : ''}${r.scored ? ' scored' : ''}`} style={{ '--tc': stripeColor(r.team) }}>
            <i class="stripe" />
            <TeamLogo t={r.team} />
            <span class="rk">{r.rank}</span>
            <span class="ab">{r.team.abbr}</span>
            <i class="ball" />
            {r.sets.length > 0 && (
              <span class="sets">
                {r.sets.map((s, i) => (
                  <span class={i === r.sets.length - 1 && c.bucket === 'live' ? 'cur' : ''}>
                    {s.games}
                    {s.tb && <sup>{s.tb}</sup>}
                  </span>
                ))}
              </span>
            )}
            {(r.sets.length === 0 || r.score) && <span class={`sc${r.record ? ' rec' : ''}`}>{r.record || r.score}</span>}
          </div>
        ))}
      </div>
      <div class="status">
        <div class="s1">
          {c.s1}
          {c.bases && (
            <svg class="bases" viewBox="0 0 20 20">
              <rect class={c.bases[1] ? 'on' : ''} x="7" y="1" width="6" height="6" transform="rotate(45 10 4)" />
              <rect class={c.bases[2] ? 'on' : ''} x="1" y="8" width="6" height="6" transform="rotate(45 4 11)" />
              <rect class={c.bases[0] ? 'on' : ''} x="13" y="8" width="6" height="6" transform="rotate(45 16 11)" />
            </svg>
          )}
        </div>
        {c.s2 && <div class={`s2${c.tone ? ` ${c.tone}` : ''}`}>{c.s2}</div>}
      </div>
    </div>
  );
}

function Header({ s }: { s: TickerSection }) {
  return (
    <div class={`hdr${s.live ? ' live' : ''}`}>
      <div class="t">
        <SportIcon family={s.family} />
        {s.sportShort}
      </div>
      <div class="n">{s.live ? `${s.live} LIVE · ${s.games.length}` : `${s.games.length} GAME${s.games.length === 1 ? '' : 'S'}`}</div>
    </div>
  );
}

/** "Put on screen 1–4": what clicking a game in either ticker offers. */
export function PickMenu({ st, game, at, onClose }: { st: AppState; game: GameDTO; at: { x: number; y: number }; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', down));
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const left = Math.min(at.x, window.innerWidth - 220);
  const why = !game.channel ? (game.unavailable ?? 'Not in your lineup') : game.channel.regional === 'unconfirmed' ? (game.family === 'tennis' ? `${game.channel.name} may show another court` : 'Regional: your station may show another game') : null;
  return (
    <div class="tk-pick" ref={ref} style={{ left: `${left}px`, top: `${at.y}px` }}>
      <b>{game.name}</b>
      {why && <span class="why">{why}</span>}
      {game.channel && (
        <div class="scr">
          {st.screens.map((sc) => (
            <button
              class="btn"
              title={`Make it screen ${sc.id}'s game`}
              onClick={() => {
                void act('setHome', sc.id, { gameId: game.id });
                onClose();
              }}
            >
              Screen {sc.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SCOPE_LABEL = { screens: 'My screens', followed: 'My sports', all: 'All sports' } as const;

export interface BigTickerProps {
  st: AppState;
  alerts: TickerAlerts;
  now: number;
  osFullscreen: boolean;
  settingsOpen: boolean;
  onSettings(): void;
}

export function BigTicker({ st, alerts, now, osFullscreen, settingsOpen, onSettings }: BigTickerProps) {
  const t = st.settings.ticker;
  const H = t.height;
  const fs = H / 4.6;
  const cw = Math.round(fs * 16.4);
  const hw = Math.round(fs * 5.4);
  const vp = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [vpW, setVpW] = useState(1000);
  const [pick, setPick] = useState<{ game: GameDTO; at: { x: number; y: number } } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const motion = useRef({ offset: 0, half: 0, hover: false, paused: false, last: 0, speed: t.speed });
  motion.current.speed = t.speed;

  const games = tickerGames(st, t.scope);
  const sections = tickerSections(games, st.sports.map((s) => s.id), { cfbTop25: t.cfbTop25 });
  const items = sections.flatMap((s) => [{ key: `h:${s.sport}`, w: hw, s, g: null as GameDTO | null }, ...s.games.map((g) => ({ key: g.id, w: g.family === 'tennis' ? Math.round(cw * 1.12) : cw, s, g }))]);
  const total = items.reduce((a, x) => a + x.w, 0);
  const scroll = total > vpW;
  motion.current.half = total;

  useLayoutEffect(() => {
    if (!vp.current) return;
    const ro = new ResizeObserver(() => setVpW(vp.current?.clientWidth ?? 1000));
    ro.observe(vp.current);
    return () => ro.disconnect();
  }, []);

  // The scroll: one transform per frame through a ref, so state pushes never restart it.
  useEffect(() => {
    let raf = 0;
    const frame = (ts: number) => {
      const m = motion.current;
      const dt = Math.min(0.1, (ts - m.last) / 1000 || 0);
      m.last = ts;
      if (!m.hover && !m.paused && m.half > 0) m.offset = (m.offset + 3 * fs * m.speed * dt) % m.half;
      if (track.current) track.current.style.transform = `translate3d(${-Math.round(m.offset)}px,0,0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fs]);

  // Space pauses, ←/→ change the speed (saved), while the mouse is over the ticker.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!motion.current.hover || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === ' ') {
        motion.current.paused = !motion.current.paused;
        setToast(motion.current.paused ? 'PAUSED' : 'RESUMED');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const speed = Math.min(4, Math.max(0.25, Math.round(t.speed * (e.key === 'ArrowRight' ? 1.25 : 0.8) * 100) / 100));
        void post('/api/settings', { ticker: { speed } });
        setToast(`SPEED ${Math.round(speed * 100)}%`);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [t.speed]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1200);
    return () => clearTimeout(id);
  }, [toast]);

  const live = games.filter((g) => g.phase === 'LIVE').length;
  const next = games.filter((g) => g.phase === 'PRE' && g.startTime).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))[0];
  const si = st.signin;
  const fsScreen = st.view.fullscreen ? st.screens.find((s) => s.id === st.view.fullscreen) : undefined;
  const render = (x: (typeof items)[number], copy: number) =>
    x.g ? (
      <Card key={`${copy}:${x.key}`} c={formatCard(x.g, alerts.active(x.g.id, Date.now()))} onPick={(e) => setPick({ game: x.g!, at: { x: e.clientX, y: H + 6 } })} />
    ) : (
      <Header key={`${copy}:${x.key}`} s={x.s} />
    );

  return (
    <div class="bt" style={{ '--h': `${H}px`, '--fs': `${fs}px`, '--cw': `${cw}px`, '--hw': `${hw}px`, '--lw': `${Math.round(fs * 6.3)}px`, '--sw': `${Math.round(fs * 5.5)}px` }}>
      <div class="label">
        <div class="brand">
          <span class="rz">TI</span>
          <span class="clk">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div class="date">
          {new Date(now).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')} · {SCOPE_LABEL[t.scope]}
          {t.cfbTop25 ? ' · CFB T25' : ''}
        </div>
        <div class="state">
          {st.mode !== 'live' ? <span class="warn">{st.mode === 'replay' ? 'REPLAY' : 'DRY RUN'}</span> : null}
          {si && si.state !== 'ok' ? (
            <span class={si.state === 'failed' ? 'bad' : 'warn'} title={si.detail}>
              {si.state === 'signing-in' ? 'SIGNING IN' : si.state === 'needed' ? 'SIGN IN' : 'SIGN-IN FAILED'}
            </span>
          ) : live ? (
            <>
              <i class="dot" />
              {live} LIVE
            </>
          ) : next ? (
            `NEXT ${new Date(next.startTime!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          ) : games.length ? (
            'ALL FINAL'
          ) : (
            'NO GAMES'
          )}
        </div>
      </div>

      <div
        class={`vp${scroll ? '' : ' static'}`}
        ref={vp}
        onMouseEnter={() => (motion.current.hover = true)}
        onMouseLeave={() => (motion.current.hover = false)}
      >
        {items.length ? (
          <div class="track" ref={track}>
            {items.map((x) => render(x, 0))}
            {scroll && items.map((x) => render(x, 1))}
          </div>
        ) : (
          <div class="msg">{t.scope === 'screens' ? 'No games on your screens yet.' : 'No games today.'}</div>
        )}
        {toast && <div class="toast">{toast}</div>}
      </div>

      <div class="ctl">
        <div>
          {fsScreen && (
            <>
              <button class={`btn${fsScreen.mode === 'LOCKED' ? ' on' : ''}`} onClick={() => void act(fsScreen.mode === 'LOCKED' ? 'unlock' : 'lock', fsScreen.id)} title="Lock this screen: no automatic switching (L)">
                <LockIcon open={fsScreen.mode !== 'LOCKED'} />
              </button>
              <button class="btn" onClick={() => void post('/api/view', { fullscreen: 0 })} title={`Screen ${fsScreen.id} is fullscreen: back to the grid (Esc)`}>
                S{fsScreen.id} · Exit
              </button>
            </>
          )}
          <button class="iconbtn on" onClick={() => post('/api/settings', { ticker: { big: false } })} title="Big ticker off (T)">
            <TickerIcon />
          </button>
          <button class={`iconbtn${settingsOpen ? ' on' : ''}`} onClick={onSettings} title="Settings (S)">
            <GearIcon />
          </button>
          <button class="iconbtn" onClick={() => void window.rzShell?.toggleFullscreen()} title="Window full screen (F11)">
            <FullscreenIcon on={osFullscreen} />
          </button>
        </div>
      </div>

      {pick && <PickMenu st={st} game={pick.game} at={pick.at} onClose={() => setPick(null)} />}
    </div>
  );
}
