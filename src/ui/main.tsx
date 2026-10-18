import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import css from './style.css';
import { FullscreenIcon, GearIcon } from './icons';
import { Screen } from './screen';
import { Settings } from './settings';
import { act, post, type AppState, type GameDTO } from './util';

// The RedZone app window's UI: top bar, four screen overlays, settings drawer. State arrives as
// server-sent events from the app (on every tick and right after every action).

declare global {
  interface Window {
    rzShell?: { toggleFullscreen(): Promise<boolean>; onFullscreen(cb: (on: boolean) => void): void };
  }
}

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

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
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const hovered = useRef<number | null>(null);

  useEffect(() => {
    window.rzShell?.onFullscreen(setFullscreen);
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Keys: 1-4 sound, M mute, L lock, H home, S settings, F fullscreen (F11 is handled by the window).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const sc = hovered.current;
      const screen = sc ? st?.screens.find((s) => s.id === sc) : undefined;
      if (/^[1-4]$/.test(k)) void post('/api/audio', { screen: Number(k) });
      else if (k === 'm' || k === '0') void post('/api/audio', { screen: 0 });
      else if (k === 's') setSettings((x) => !x);
      else if (k === 'f') void window.rzShell?.toggleFullscreen();
      else if (k === 'escape') {
        setSettings(false);
        setMenuFor(null);
      } else if (k === 'l' && screen) void act(screen.mode === 'LOCKED' ? 'unlock' : 'lock', screen.id);
      else if (k === 'h' && screen) void act('goHome', screen.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [st]);

  const games = useMemo(() => new Map<string, GameDTO>((st?.games ?? []).map((g) => [g.id, g])), [st]);
  if (!st) return <div class="app"><div class="banner">Connecting to RedZone…</div></div>;

  const now = appNow();
  const liveCount = st.games.filter((g) => g.phase === 'LIVE').length;
  const si = st.signin;
  return (
    <div class={`app${fullscreen ? ' fullscreen' : ''}`}>
      <header class="topbar">
        <div class="brand">
          <span class="mark">RZ</span>
          <span class="word">
            Red<span>Zone</span>
          </span>
        </div>
        <span class="chip">
          <span class="dot" />
          {liveCount} live
        </span>
        {st.mode !== 'live' && <span class="chip warn">{st.mode === 'replay' ? 'REPLAY' : 'DRY RUN · no video'}</span>}
        {si && si.state !== 'ok' && (
          <span class={`chip ${si.state === 'failed' ? 'bad' : 'warn'}`} title={si.detail}>
            <span class="dot" />
            {si.state === 'signing-in' ? `Signing in to ${st.provider.shortName}…` : si.state === 'needed' ? `Sign in to ${st.provider.shortName}` : `${st.provider.shortName} sign-in failed`}
          </span>
        )}
        <span class="spacer" />
        <span class="clock">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span class="spacer" />
        <span class="seg" title="Switch sensitivity: how eagerly screens leave their game for breaks">
          {(['low', 'medium', 'high'] as const).map((s) => (
            <button class={st.settings.sensitivity === s ? 'on' : ''} onClick={() => post('/api/settings', { sensitivity: s })}>
              {s === 'low' ? 'Low' : s === 'medium' ? 'Med' : 'High'}
            </button>
          ))}
        </span>
        <span class="seg" title="Sound: you pick the screen, or it follows the most exciting game">
          <button class={st.audio.mode === 'manual' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'manual' })}>
            Manual
          </button>
          <button class={st.audio.mode === 'auto' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'auto' })}>
            Auto
          </button>
        </span>
        <button class={`iconbtn${settings ? ' on' : ''}`} onClick={() => setSettings(!settings)} title="Settings (S)">
          <GearIcon />
        </button>
        <button class="iconbtn" onClick={() => void window.rzShell?.toggleFullscreen()} title="Full screen (F11)">
          <FullscreenIcon on={fullscreen} />
        </button>
      </header>

      <main class={`grid n${st.screens.length}`}>
        {st.screens.map((sc) => (
          <Screen
            key={sc.id}
            st={st}
            sc={sc}
            games={games}
            now={now}
            menuOpen={menuFor === sc.id}
            setMenuOpen={(open) => setMenuFor(open ? sc.id : null)}
            onHover={(id) => {
              if (id !== null || hovered.current === sc.id) hovered.current = id;
            }}
            onError={setToast}
          />
        ))}
      </main>

      {settings && <Settings st={st} onClose={() => setSettings(false)} onError={setToast} />}
      {!connected && <div class="banner bad">Lost contact with the RedZone app. Reconnecting…</div>}
      {connected && si?.state === 'needed' && <div class="banner">{si.detail.replace(/\.?$/, '.')}</div>}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
