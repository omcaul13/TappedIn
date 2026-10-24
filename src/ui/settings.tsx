import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { SportIcon } from './icons';
import { ServicePanel } from './service';
import { FULLSCREEN_KEY, IS_MAC, post, type AppState } from './util';

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
      <div class="field-top">
        <label>{label}</label>
        <output>
          {v}
          {unit}
        </output>
      </div>
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
  const sv = st.service;
  // Like setup's "How many screens?": no more than your plan played at once in the last stream test.
  const maxScreens = sv.measuredStreams ? Math.min(4, sv.measuredStreams) : 4;
  return (
    <>
      <h5>Screens</h5>
      <div class="seg wide">
        {[1, 2, 3, 4].map((n) => (
          <button class={sv.screens === n ? 'on' : ''} disabled={n > maxScreens} title={n > maxScreens ? `Your plan played ${sv.measuredStreams} at once in the last test (Re-test streams in TV service)` : `Show ${n} screen${n === 1 ? '' : 's'}`} onClick={() => post('/api/service/screens', { n })}>
            {n}
          </button>
        ))}
      </div>

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
  // Only the sport that changed: "Same as Switching" is 'global', which also overrides the config file.
  const choose = (id: string, v: string) => set({ sportSensitivity: { [id]: (v || 'global') as 'low' | 'medium' | 'high' | 'global' } });
  return (
    <div class="persport">
      {st.sports
        .filter((x) => x.enabled)
        .map((x) => (
          <div class="persport-row">
            <span class="nm" title={x.name}>
              <SportIcon family={x.family} />
              {x.name}
            </span>
            <div class="seg">
              {[
                ['', 'Same'],
                ['low', 'Low'],
                ['medium', 'Med'],
                ['high', 'High'],
              ].map(([v, name]) => (
                <button class={(x.sensitivity ?? '') === v ? 'on' : ''} onClick={() => choose(x.id, v)} title={v ? `${name === 'Med' ? 'Medium' : name} for ${x.name}` : 'Same as Switching in the basic settings'}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/** One titled block of settings, with a line saying what it's for. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ComponentChildren }) {
  return (
    <section class="group">
      <h5>{title}</h5>
      {hint && <p class="group-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** A block that starts folded: the long lists nobody needs every time. */
function Fold({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="group fold">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function Advanced({ st, set, onTips }: { st: AppState; set: Set; onTips(): void }) {
  const s = st.settings;
  const t = s.ticker;
  const tk = (o: Record<string, unknown>) => set({ ticker: o });
  const feed = st.feed.filter((f) => f.kind === 'switch' || f.kind === 'audio').slice(-25).reverse();
  return (
    <>
      <p class="adv-intro">Fine-tuning. The basic settings cover most people.</p>

      <Fold title="Switching per sport">
        <p class="group-hint">How eagerly each sport you follow switches. Same follows Switching in the basic settings.</p>
        {s.breakModel === 'classic' && <div class="note">The config file uses the classic break detector for college football, which ignores sensitivity.</div>}
        <PerSport st={st} set={set} />
      </Fold>

      <Group title="Timing">
        <Slider label="Dwell time" value={s.dwellSeconds} min={10} max={60} hint="Least time between two automatic switches on one screen" onCommit={(v) => set({ dwellSeconds: v })} />
        <Slider label="Time on a substitute" value={s.minSubstituteSeconds} min={0} max={120} step={5} hint="Stay at least this long on another game before going back to yours" onCommit={(v) => set({ minSubstituteSeconds: v })} />
        <Toggle label="Show a game on two screens when nothing else is live" on={s.allowDuplicates} onClick={() => set({ allowDuplicates: !s.allowDuplicates })} />
      </Group>

      <Group title="Live data from ESPN" hint="How often TappedIn checks. Faster spots breaks sooner.">
        <Slider label="Scoreboard" value={s.scoreboardLiveSeconds} min={6} max={30} unit="s" hint="All games: scores, clock, last play" onCommit={(v) => set({ scoreboardLiveSeconds: v })} />
        <Slider label="Play-by-play, games on screen" value={s.hotSummarySeconds} min={3} max={20} hint="Spots breaks and restarts sooner" onCommit={(v) => set({ hotSummarySeconds: v })} />
        <Slider label="Play-by-play, likely substitutes" value={s.summarySeconds} min={6} max={30} hint="Games the director may switch to" onCommit={(v) => set({ summarySeconds: v })} />
      </Group>

      <Group title="Tickers">
        <div class="field-top">
          <label>Mini ticker shows</label>
        </div>
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
      </Group>

      <Group title="Halftime">
        <div class="toggle">
          <span>YouTube highlights</span>
          <span class="chip">{s.youtube ? 'on' : 'off (no YT_API_KEY in .env)'}</span>
        </div>
      </Group>

      <Fold title="Recent switches">
        <div class="feed">
          {feed.length ? (
            feed.map((f) => (
              <div class={f.kind === 'switch' ? 'switch-item' : ''} title={f.text}>
                <span class="at">{new Date(f.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                {f.screen ? <span class="scr">S{f.screen}</span> : null}
                <span class="tx">{f.text}</span>
              </div>
            ))
          ) : (
            <div>None yet</div>
          )}
        </div>
      </Fold>

      <Fold title="Keyboard shortcuts">
        <div class="keys">
          <span class="k">
            <kbd>1</kbd>–<kbd>4</kbd>
          </span>
          <span>Fullscreen that screen (or double-click it)</span>
          <span class="k">
            <kbd>0</kbd> <kbd>Esc</kbd>
          </span>
          <span>Back to the grid</span>
          <span class="k">
            <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>4</kbd>
          </span>
          <span>Sound from screen 1–4</span>
          <span class="k">
            <kbd>M</kbd>
          </span>
          <span>Mute everything</span>
          <span class="k">
            <kbd>L</kbd>
          </span>
          <span>Lock / unlock the screen under the mouse (or the fullscreen one)</span>
          <span class="k">
            <kbd>H</kbd>
          </span>
          <span>Back to that screen's game</span>
          <span class="k">
            <kbd>S</kbd>
            {IS_MAC && (
              <>
                {' '}
                <kbd>⌘,</kbd>
              </>
            )}
          </span>
          <span>Settings</span>
          <span class="k">
            <kbd>T</kbd>
          </span>
          <span>Big ticker on / off</span>
          <span class="k">
            <kbd>Space</kbd> <kbd>←</kbd>
            <kbd>→</kbd>
          </span>
          <span>Over the big ticker: pause, speed</span>
          <span class="k">
            <kbd>F</kbd> <kbd>{FULLSCREEN_KEY}</kbd>
          </span>
          <span>Window full screen (the whole monitor)</span>
        </div>
      </Fold>

      <div class="adv-foot">
        <button class="btn" onClick={onTips}>
          Show the tips again
        </button>
        {s.overridden.length > 0 && (
          <button class="btn" onClick={() => set({ reset: true })} title="Your service, standby views and tickers stay">
            Reset to the config file
          </button>
        )}
      </div>
    </>
  );
}

// ---- the drawer ------------------------------------------------------------------------------------

export function Settings({ st, onClose, onError, onTips }: { st: AppState; onClose(): void; onError(m: string): void; onTips(): void }) {
  const set = async (body: Record<string, unknown>) => {
    const r = await post('/api/settings', body);
    if (!r.ok) onError(r.message ?? 'could not change that setting');
  };
  const [page, setPage] = useState<'basic' | 'advanced' | 'service'>('basic');
  const title = { basic: 'Settings', advanced: 'Advanced', service: 'TV service' }[page];
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <aside class={`drawer${page === 'advanced' ? ' wide' : ''}`}>
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
        {page === 'advanced' && <Advanced st={st} set={set} onTips={onTips} />}
        {page === 'service' && <ServicePanel st={st} onError={onError} />}
      </aside>
    </>
  );
}
