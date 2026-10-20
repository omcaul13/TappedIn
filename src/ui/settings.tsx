import { useEffect, useState } from 'preact/hooks';
import { SportIcon } from './icons';
import { ServicePanel } from './service';
import { post, type AppState } from './util';

// Settings drawer. Basic: the few things most people change (how eagerly screens switch, sound, which
// sports, the tickers, the TV service). Advanced, behind its own button: per-sport levels, timing,
// ESPN polling, ticker fine-tuning, recent switches and the keys, for the picky.

const SENS = [
  { id: 'low', name: 'Low', text: 'Only clear long breaks. Fewest switches.' },
  { id: 'medium', name: 'Medium', text: 'Also likely breaks, a little sooner.' },
  { id: 'high', name: 'High', text: 'Most breaks, and jumps to big moments.' },
] as const;

const SCOPES = [
  { id: 'screens', name: 'My screens' },
  { id: 'followed', name: 'My sports' },
  { id: 'all', name: 'All sports' },
] as const;

type Set = (body: Record<string, unknown>) => void;

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick(): void }) {
  return (
    <div class="toggle">
      <span>{label}</span>
      <button class={`switch${on ? ' on' : ''}`} onClick={onClick} aria-label={label} />
    </div>
  );
}

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

// ---- basic -----------------------------------------------------------------------------------------

function Basic({ st, set, open }: { st: AppState; set: Set; open(page: 'advanced' | 'service'): void }) {
  const s = st.settings;
  const t = s.ticker;
  const enabled = st.sports.filter((x) => x.enabled).map((x) => x.id);
  return (
    <>
      <h5>Switching</h5>
      <div class="sens">
        {SENS.map((x) => (
          <button class={s.sensitivity === x.id ? 'on' : ''} onClick={() => set({ sensitivity: x.id })}>
            <b>{x.name}</b>
            <span>{x.text}</span>
          </button>
        ))}
      </div>

      <h5>Sound</h5>
      <div class="seg wide">
        <button class={st.audio.mode === 'manual' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'manual' })}>
          You pick
        </button>
        <button class={st.audio.mode === 'auto' ? 'on' : ''} onClick={() => post('/api/audio', { mode: 'auto' })}>
          Follows the action
        </button>
      </div>

      <h5>Sports</h5>
      <div class="sportchips">
        {st.sports.map((x) => (
          <button class={x.enabled ? 'on' : ''} title={x.enabled ? `Following ${x.name}` : `Not following ${x.name}`} onClick={() => set({ enabledSports: x.enabled ? enabled.filter((id) => id !== x.id) : [...enabled, x.id] })}>
            <SportIcon family={x.family} />
            {x.short}
          </button>
        ))}
      </div>

      <h5>Tickers</h5>
      <Toggle label="Big ticker across the top" on={t.big} onClick={() => set({ ticker: { big: !t.big } })} />
      <Toggle label="Mini ticker by the clock" on={t.mini} onClick={() => set({ ticker: { mini: !t.mini } })} />
      <div class="seg wide">
        {SCOPES.map((x) => (
          <button class={t.scope === x.id ? 'on' : ''} onClick={() => set({ ticker: { scope: x.id, miniScope: null } })}>
            {x.name}
          </button>
        ))}
      </div>

      <h5>TV service</h5>
      <button class="row-link" onClick={() => open('service')}>
        <span>{st.provider.name}</span>
        <span class="go">Manage ›</span>
      </button>

      <button class="row-link adv" onClick={() => open('advanced')}>
        <span>Advanced settings</span>
        <span class="go">›</span>
      </button>
    </>
  );
}

// ---- advanced --------------------------------------------------------------------------------------

/** Each followed sport's own sensitivity ("Same as Switching" by default). */
function PerSport({ st, set }: { st: AppState; set: Set }) {
  const levels = Object.fromEntries(st.sports.filter((x) => x.sensitivity).map((x) => [x.id, x.sensitivity]));
  return (
    <div class="persport">
      {st.sports
        .filter((x) => x.enabled)
        .map((x) => (
          <>
            <span title={x.name}>{x.name}</span>
            <select
              value={x.sensitivity ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const next = { ...levels };
                if (v) next[x.id] = v as 'low';
                else delete next[x.id];
                set({ sportSensitivity: next });
              }}
            >
              <option value="">Same as Switching</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </>
        ))}
    </div>
  );
}

function Advanced({ st, set }: { st: AppState; set: Set }) {
  const s = st.settings;
  const t = s.ticker;
  const tk = (o: Record<string, unknown>) => set({ ticker: o });
  const feed = st.feed.filter((f) => f.kind === 'switch' || f.kind === 'audio').slice(-25).reverse();
  return (
    <>
      <div class="note">Fine-tuning. The basic settings cover most people.</div>

      <h5>Per sport</h5>
      {s.breakModel === 'classic' && <div class="note">The config file uses the classic break detector for college football, which ignores sensitivity.</div>}
      <PerSport st={st} set={set} />

      <h5>Timing</h5>
      <Slider label="Dwell time" value={s.dwellSeconds} min={10} max={60} hint="Least time between two automatic switches on one screen" onCommit={(v) => set({ dwellSeconds: v })} />
      <Slider label="Time on a substitute" value={s.minSubstituteSeconds} min={0} max={120} step={5} hint="Stay at least this long on another game before going back to yours" onCommit={(v) => set({ minSubstituteSeconds: v })} />
      <Toggle label="Show a game on two screens when nothing else is live" on={s.allowDuplicates} onClick={() => set({ allowDuplicates: !s.allowDuplicates })} />

      <h5>ESPN data</h5>
      <Slider label="Scoreboard every" value={s.scoreboardLiveSeconds} min={6} max={30} hint="All games: scores, clock, last play" onCommit={(v) => set({ scoreboardLiveSeconds: v })} />
      <Slider label="Games on screen: play-by-play every" value={s.hotSummarySeconds} min={3} max={20} hint="Spots breaks and restarts sooner" onCommit={(v) => set({ hotSummarySeconds: v })} />
      <Slider label="Likely substitutes: every" value={s.summarySeconds} min={6} max={30} hint="Games the director may switch to" onCommit={(v) => set({ summarySeconds: v })} />

      <h5>Tickers</h5>
      <div class="note" style={{ margin: '0 0 4px' }}>Mini ticker shows</div>
      <div class="seg wide">
        <button class={!t.miniScope ? 'on' : ''} onClick={() => tk({ miniScope: null })} title="Same as the big ticker">
          Same
        </button>
        {SCOPES.map((x) => (
          <button class={t.miniScope === x.id ? 'on' : ''} onClick={() => tk({ miniScope: x.id })}>
            {x.name}
          </button>
        ))}
      </div>
      <Toggle label="College football: top-25 games only" on={t.cfbTop25} onClick={() => tk({ cfbTop25: !t.cfbTop25 })} />
      <Slider label="Mini ticker: each game for" value={t.miniIntervalSeconds} min={2} max={30} onCommit={(v) => tk({ miniIntervalSeconds: v })} />
      <Slider label="Big ticker height" value={t.height} min={88} max={150} unit=" px" onCommit={(v) => tk({ height: v })} />
      <Slider label="Big ticker speed" value={Math.round(t.speed * 100)} min={25} max={400} step={5} unit="%" hint="Or ←/→ with the mouse over the ticker" onCommit={(v) => tk({ speed: v / 100 })} />

      <h5>Halftime</h5>
      <div class="toggle">
        <span>YouTube highlights</span>
        <span class="chip">{s.youtube ? 'on' : 'off (no YT_API_KEY in .env)'}</span>
      </div>

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
        <span>Fullscreen that screen (or double-click it)</span>
        <kbd>0</kbd> <kbd>Esc</kbd>
        <span>Back to the grid</span>
        <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>4</kbd>
        <span>Sound from screen 1–4</span>
        <kbd>M</kbd>
        <span>Mute everything</span>
        <kbd>L</kbd>
        <span>Lock / unlock the screen under the mouse (or the fullscreen one)</span>
        <kbd>H</kbd>
        <span>Back to that screen's game</span>
        <kbd>S</kbd>
        <span>Settings</span>
        <kbd>T</kbd>
        <span>Big ticker on / off</span>
        <kbd>Space</kbd> <kbd>←</kbd><kbd>→</kbd>
        <span>Over the big ticker: pause, speed</span>
        <kbd>F</kbd> <kbd>F11</kbd>
        <span>Window full screen (the whole monitor)</span>
      </div>

      {s.overridden.length > 0 && (
        <button class="btn" style={{ marginTop: '16px' }} onClick={() => set({ reset: true })} title="Your service, standby views and tickers stay">
          Reset to the config file
        </button>
      )}
    </>
  );
}

// ---- the drawer ------------------------------------------------------------------------------------

export function Settings({ st, onClose, onError }: { st: AppState; onClose(): void; onError(m: string): void }) {
  const set = async (body: Record<string, unknown>) => {
    const r = await post('/api/settings', body);
    if (!r.ok) onError(r.message ?? 'could not change that setting');
  };
  const [page, setPage] = useState<'basic' | 'advanced' | 'service'>('basic');
  const title = { basic: 'Settings', advanced: 'Advanced', service: 'TV service' }[page];
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <aside class="drawer">
        <div class="drawer-head">
          {page !== 'basic' && (
            <button class="iconbtn" onClick={() => setPage('basic')} title="Back to settings" aria-label="back">
              ‹
            </button>
          )}
          <h3>{title}</h3>
          <span class="grow" />
          <button class="iconbtn" onClick={onClose} title="Close (Esc)" aria-label="close">
            ×
          </button>
        </div>
        {page === 'basic' && <Basic st={st} set={set} open={setPage} />}
        {page === 'advanced' && <Advanced st={st} set={set} />}
        {page === 'service' && <ServicePanel st={st} onError={onError} />}
      </aside>
    </>
  );
}
