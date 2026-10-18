import { useEffect, useState } from 'preact/hooks';
import { ServicePanel } from './service';
import { post, type AppState } from './util';

// Collapsible settings drawer: switch sensitivity, sound mode, dwell, time on a substitute, ESPN poll
// rates, duplicates, plus the recent decisions and the keyboard shortcuts.

const SENS = [
  { id: 'low', name: 'Low', text: 'Only clear long breaks: ends of quarters, kickoffs after scores, injuries, and TV timeouts once the quiet makes them obvious. Fewest switches.' },
  { id: 'medium', name: 'Medium', text: 'Also likely breaks: team timeouts and possession changes a little sooner.' },
  { id: 'high', name: 'High', text: 'Chase most stoppages, and jump to red-zone games during a break. Most switches.' },
] as const;

function Slider({ label, value, min, max, step = 1, unit = 's', hint, onCommit }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; hint?: string; onCommit(v: number): void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div class="field">
      <label>{label}</label>
      <output>
        {v}
        {unit}
      </output>
      <input type="range" min={min} max={max} step={step} value={v} onInput={(e) => setV(Number((e.target as HTMLInputElement).value))} onChange={(e) => onCommit(Number((e.target as HTMLInputElement).value))} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Settings({ st, onClose, onError }: { st: AppState; onClose(): void; onError(m: string): void }) {
  const s = st.settings;
  const set = async (body: Record<string, unknown>) => {
    const r = await post('/api/settings', body);
    if (!r.ok) onError(r.message ?? 'could not change that setting');
  };
  const feed = st.feed.filter((f) => f.kind === 'switch' || f.kind === 'audio').slice(-25).reverse();
  const [tab, setTab] = useState<'switching' | 'service'>('switching');
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <aside class="drawer">
        <h3>Settings</h3>
        <div class="seg tabs">
          <button class={tab === 'switching' ? 'on' : ''} onClick={() => setTab('switching')}>
            Switching
          </button>
          <button class={tab === 'service' ? 'on' : ''} onClick={() => setTab('service')}>
            TV service
          </button>
        </div>
        {tab === 'service' && <ServicePanel st={st} onError={onError} />}
        {tab === 'switching' && (
          <>
        <div class="note">Changes apply right away and are saved for next time.</div>

        <h5>Switch sensitivity</h5>
        <div class="sens">
          {SENS.map((x) => (
            <button class={s.sensitivity === x.id ? 'on' : ''} onClick={() => set({ sensitivity: x.id })}>
              <b>{x.name}</b>
              <span>{x.text}</span>
            </button>
          ))}
        </div>
        {s.breakModel === 'classic' && <div class="note" style={{ marginTop: '6px' }}>The config file uses the classic break detector, which ignores sensitivity.</div>}

        <h5>Sound</h5>
        <div class="seg">
          <button class={st.audio.mode === 'manual' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'manual' })}>
            You pick
          </button>
          <button class={st.audio.mode === 'auto' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'auto' })}>
            Follows the action
          </button>
        </div>

        <h5>Timing</h5>
        <Slider label="Dwell time" value={s.dwellSeconds} min={10} max={60} hint="Least time between two automatic switches on one screen" onCommit={(v) => set({ dwellSeconds: v })} />
        <Slider label="Time on a substitute" value={s.minSubstituteSeconds} min={0} max={120} step={5} hint="Stay at least this long on another game before going back to yours" onCommit={(v) => set({ minSubstituteSeconds: v })} />

        <h5>ESPN data</h5>
        <Slider label="Scoreboard every" value={s.scoreboardLiveSeconds} min={6} max={30} hint="All games: scores, clock, last play" onCommit={(v) => set({ scoreboardLiveSeconds: v })} />
        <Slider label="Games on screen: play-by-play every" value={s.hotSummarySeconds} min={3} max={20} hint="Your games and what the screens show: spots breaks and restarts sooner" onCommit={(v) => set({ hotSummarySeconds: v })} />
        <Slider label="Likely substitutes: every" value={s.summarySeconds} min={6} max={30} hint="Games the director may switch to" onCommit={(v) => set({ summarySeconds: v })} />

        <h5>Other</h5>
        <div class="toggle">
          <span>Show a game on two screens when nothing else is live</span>
          <button class={`switch${s.allowDuplicates ? ' on' : ''}`} onClick={() => set({ allowDuplicates: !s.allowDuplicates })} aria-label="allow duplicates" />
        </div>
        <div class="toggle">
          <span>YouTube halftime highlights</span>
          <span class="chip">{s.youtube ? 'on' : 'off (no YT_API_KEY in .env)'}</span>
        </div>
        {s.overridden.length > 0 && (
          <button class="btn" style={{ marginTop: '6px' }} onClick={() => set({ reset: true })}>
            Reset to the config file
          </button>
        )}

        <h5>Recent switches</h5>
        <div class="feed">
          {feed.length ? (
            feed.map((f) => (
              <div class={f.kind === 'switch' ? 'switch-item' : ''} title={f.text}>
                {new Date(f.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} {f.screen ? `S${f.screen} ` : ''}
                {f.text}
              </div>
            ))
          ) : (
            <div>None yet</div>
          )}
        </div>

        <h5>Keys</h5>
        <div class="keys">
          <kbd>1</kbd>–<kbd>4</kbd>
          <span>Sound from screen 1–4</span>
          <kbd>M</kbd>
          <span>Mute everything</span>
          <kbd>L</kbd>
          <span>Lock / unlock the screen under the mouse</span>
          <kbd>H</kbd>
          <span>Back to that screen's game</span>
          <kbd>S</kbd>
          <span>Settings</span>
          <kbd>F11</kbd>
          <span>Full screen</span>
        </div>
          </>
        )}
      </aside>
    </>
  );
}
