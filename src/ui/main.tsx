import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import css from './style.css';
import { BrandGlyph, FullscreenIcon, GearIcon, LockIcon, TickerIcon } from './icons';
import { BigTicker } from './ticker/BigTicker';
import { MiniTicker } from './ticker/MiniTicker';
import { TickerAlerts, tickerGames, tickerVisibility, type TickerAlert } from './ticker/model';
import { Screen } from './screen';
import { Diagnostics } from './diagnostics';
import { Onboarding } from './onboarding';
import { Settings } from './settings';
import { FirstUseTips, tipsSeen } from './tour';
import { act, FULLSCREEN_KEY, IS_MAC, post, typingIn, type AppState, type GameDTO } from './util';

// The TappedIn app window's UI: top bar, four screen overlays, settings drawer. State arrives as
// server-sent events from the app (on every tick and right after every action).

declare global {
  interface Window {
    /** onOpenSettings: the Mac menu's TappedIn → Settings… (⌘,). */
    rzShell?: { toggleFullscreen(): Promise<boolean>; onFullscreen(cb: (on: boolean) => void): void; onOpenSettings?(cb: () => void): void };
  }
}

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
if (IS_MAC) document.documentElement.classList.add('mac');

function useAppState() {
  const [st, setSt] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(true);
  const offset = useRef(0); // app clock (replays run on a virtual one) minus this clock
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const next = JSON.parse(e.data) as AppState;
      offset.current = next.now - Date.now();
      setSt(next);
      setConnected(true);
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);
  return { st, connected, appNow: () => Date.now() + offset.current };
}

function App() {
  const { st, connected, appNow } = useAppState();
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const [tips, setTips] = useState(() => !tipsSeen());
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const hovered = useRef<number | null>(null);
  // One alert tracker for both tickers (scores and hot moments since the last state).
  const alerts = useRef(new TickerAlerts());
  const [freshAlerts, setFreshAlerts] = useState<TickerAlert[]>([]);
  useEffect(() => {
    if (!st) return;
    const fresh = alerts.current.update(tickerGames(st, 'all'), Date.now());
    if (fresh.length) setFreshAlerts(fresh);
  }, [st]);

  useEffect(() => {
    window.rzShell?.onFullscreen(setFullscreen);
    window.rzShell?.onOpenSettings?.(() => setSettings(true));
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Keys: 1-4 fullscreen a screen, 0/Esc back to the grid, Shift+1-4 sound, M mute, L lock, H home,
  // S settings, F window full screen (F11 is handled by the window).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      const digit = /^Digit([0-4])$/.exec(e.code)?.[1] ?? (/^[0-4]$/.test(k) ? k : null);
      const fs = st?.view.fullscreen ?? 0;
      // In fullscreen, L and H act on the fullscreen screen; otherwise on the one under the mouse.
      const sc = fs || hovered.current;
      const screen = sc ? st?.screens.find((s) => s.id === sc) : undefined;
      if (digit !== null && e.shiftKey && digit !== '0') void post('/api/audio', { screen: Number(digit) });
      else if (digit !== null && !e.shiftKey && st?.shell === 'electron') {
        const n = Number(digit);
        if (n === 0 || n <= st.screens.length) void post('/api/view', { fullscreen: n === fs ? 0 : n });
      } else if (k === 'm') void post('/api/audio', { screen: 0 });
      else if (k === 's') setSettings((x) => !x);
      else if (k === 't' && st) void post('/api/settings', { ticker: { big: !st.settings.ticker.big } });
      else if (k === 'f') void window.rzShell?.toggleFullscreen();
      else if (k === 'escape') {
        // First close what's open; then leave per-screen fullscreen.
        if (settings || menuFor !== null) {
          setSettings(false);
          setMenuFor(null);
        } else if (fs) void post('/api/view', { fullscreen: 0 });
      } else if (k === 'l' && screen) void act(screen.mode === 'LOCKED' ? 'unlock' : 'lock', screen.id);
      else if (k === 'h' && screen) void act('goHome', screen.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [st, settings, menuFor]);

  const games = useMemo(() => new Map<string, GameDTO>((st?.games ?? []).map((g) => [g.id, g])), [st]);
  if (!st) return <div class="app"><div class="banner">Connecting to TappedIn…</div></div>;

  const now = appNow();
  const liveCount = st.games.filter((g) => g.phase === 'LIVE').length;
  const si = st.signin;
  const fs = st.view.fullscreen;
  const fsScreen = fs ? st.screens.find((s) => s.id === fs) : undefined;
  const canFullscreen = st.shell === 'electron';
  const ticker = tickerVisibility(st.settings.ticker);
  return (
    <div class={`app${fullscreen ? ' fullscreen' : ''}${st.setup ? ' setup-mode' : ''}${tips && !st.setup ? ' touring' : ''}`} style={ticker.big && !st.setup ? { '--top': `${st.settings.ticker.height}px` } : undefined}>
      {ticker.big && !st.setup && <BigTicker st={st} alerts={alerts.current} now={now} osFullscreen={fullscreen} settingsOpen={settings} onSettings={() => setSettings(!settings)} />}
      <header class="topbar" style={ticker.big && !st.setup ? { display: 'none' } : undefined}>
        <div class="brand">
          <span class="mark" title="TappedIn"><BrandGlyph /></span>
          <span class="word">
            Tapped<span>In</span>
          </span>
        </div>
        <span class="chip">
          <span class="dot" />
          {liveCount} live
        </span>
        {st.mode !== 'live' && <span class="chip warn" title={st.mode === 'replay' ? 'A recorded day, sped up' : 'Real ESPN data, data tiles instead of video'}>{st.mode === 'replay' ? 'REPLAY' : 'DRY RUN'}</span>}
        {si && si.state !== 'ok' && (
          <span class={`chip ${si.state === 'failed' ? 'bad' : 'warn'}`} title={si.detail}>
            <span class="dot" />
            {si.state === 'signing-in' ? `Signing in to ${st.provider.shortName}…` : si.state === 'needed' ? `Sign in to ${st.provider.shortName}` : `${st.provider.shortName} sign-in failed`}
          </span>
        )}
        {fsScreen && (
          <span class="fsbar">
            <button class={`btn sq${fsScreen.mode === 'LOCKED' ? ' on' : ''}`} onClick={() => void act(fsScreen.mode === 'LOCKED' ? 'unlock' : 'lock', fsScreen.id)} title={fsScreen.mode === 'LOCKED' ? 'Locked: no automatic switching. Click to unlock (L)' : 'Lock this screen: no automatic switching (L)'}>
              <LockIcon open={fsScreen.mode !== 'LOCKED'} />
            </button>
            <button class="btn" onClick={() => void post('/api/view', { fullscreen: 0 })} title="Back to the grid (Esc or 0)">
              <FullscreenIcon on /> Screen {fsScreen.id} · Exit
            </button>
          </span>
        )}
        <span class="spacer" />
        <span class="clock">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        {ticker.mini && !st.setup && <MiniTicker st={st} alerts={alerts.current} fresh={freshAlerts} />}
        <span class="spacer" />
        <button class="iconbtn" onClick={() => post('/api/settings', { ticker: { big: true } })} title="Big ticker (T)">
          <TickerIcon />
        </button>
        <button class={`iconbtn${settings ? ' on' : ''}`} onClick={() => setSettings(!settings)} title="Settings (S)" data-tour="settings">
          <GearIcon />
        </button>
        <button class="iconbtn" onClick={() => void window.rzShell?.toggleFullscreen()} title={`Full screen (${FULLSCREEN_KEY})`}>
          <FullscreenIcon on={fullscreen} />
        </button>
      </header>

      {st.setup && <Onboarding st={st} onError={setToast} />}
      {st.diag && <Diagnostics st={st} onError={setToast} />}
      <main class={`grid n${st.screens.length}${fs ? ' focus' : ''}`} style={st.setup ? { visibility: 'hidden' } : undefined}>
        {st.screens.map((sc) => (
          <Screen
            key={sc.id}
            st={st}
            sc={sc}
            games={games}
            now={now}
            fullscreen={fs === sc.id}
            hiddenByFullscreen={fs !== 0 && fs !== sc.id}
            canFullscreen={canFullscreen}
            menuOpen={menuFor === sc.id}
            setMenuOpen={(open) => setMenuFor(open ? sc.id : null)}
            onHover={(id) => {
              if (id !== null || hovered.current === sc.id) hovered.current = id;
            }}
            onError={setToast}
          />
        ))}
      </main>

      {settings && (
        <Settings
          st={st}
          onClose={() => setSettings(false)}
          onError={setToast}
          onTips={() => {
            setSettings(false);
            setTips(true);
          }}
        />
      )}
      {tips && !st.setup && !st.diag && <FirstUseTips onDone={() => setTips(false)} />}
      {!connected && <div class="banner bad">Lost contact with the TappedIn app. Reconnecting…</div>}
      {connected && si?.state === 'needed' && <div class="banner">{si.detail.replace(/\.?$/, '.')}</div>}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
