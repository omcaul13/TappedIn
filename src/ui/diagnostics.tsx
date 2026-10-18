import { useEffect, useState } from 'preact/hooks';
import type { DiagResult } from '../setup/diagnostics';
import { StatusChip } from './onboarding';
import { post, type AppState } from './util';

// Diagnostics mode: run each part of the service's adapter on its own, see what it saw, fix the
// config values it uses, and export the fixes to a file for the project owner. Screen 1 stays
// uncovered on the left so you can watch the tune, playback and hiding steps happen.

const STEPS: { id: 'signin' | 'scan' | 'tune' | 'playback' | 'hide'; title: string; what: string }[] = [
  { id: 'signin', title: 'Sign-in detection', what: 'Loads the service in a hidden window and checks that RedZone can tell you are signed in.' },
  { id: 'scan', title: 'Channel guide', what: 'Reads the guide and matches its channels to the college-football networks.' },
  { id: 'tune', title: 'Tuning', what: 'Changes screen 1 to the first carried channel and checks it landed on it.' },
  { id: 'playback', title: 'Playback', what: 'Watches screen 1 until the video plays (or the service reports why not).' },
  { id: 'hide', title: 'Full-screen video', what: "Checks that the service's menus are hidden and the video fills the screen." },
];

/** Set `value` at a dotted path inside a copy of `obj`. */
function setPath(obj: Record<string, unknown>, dotted: string, value: unknown): Record<string, unknown> {
  const out = structuredClone(obj);
  const keys = dotted.split('.');
  let cur = out;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

function parseValue(text: string, like: unknown): unknown {
  if (typeof like === 'number') return Number(text);
  if (typeof like === 'boolean') return text === 'true';
  if (like === null && text === '') return null;
  return text;
}

export function Diagnostics({ st, onError }: { st: AppState; onError(m: string): void }) {
  const d = st.diag!;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [json, setJson] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setEdits({}), [d.providerId]);

  const run = async (path: string, body: Record<string, unknown> = {}) => {
    const r = await post(path, body);
    if (!r.ok) onError(r.message ?? 'that didn\'t work');
    return r;
  };
  /** The saved override with this form's edits applied. */
  const draft = () => Object.entries(edits).reduce((o, [k, v]) => setPath(o, k, parseValue(v, d.values[k])), d.override);
  const save = async (override: Record<string, unknown>) => {
    setMsg(null);
    const r = await run('/api/diag/save', { override });
    if (r.ok) {
      setEdits({});
      setJson(null);
      setMsg('Saved. Run the step again to check.');
    }
  };
  const passed = STEPS.filter((s) => d.results[s.id]?.pass).length;

  return (
    <div class="diag">
      <div class="diag-cells">
        <div class="hole">
          <span class="hole-tag">Screen 1</span>
        </div>
        <div class="cover" />
        <div class="cover" />
        <div class="cover" />
      </div>
      <aside class="diag-panel">
        <div class="diag-head">
          <div>
            <h2>Diagnostics</h2>
            <div class="svc-meta">
              <b>{d.providerName}</b> <StatusChip status={d.status} /> <span>{passed} of 5 passed</span>
            </div>
          </div>
          <button class="btn" onClick={() => run('/api/diag/close')}>
            Close
          </button>
        </div>
        <p class="note">Run the steps in order. A step that fails shows the settings it depends on: change them and press Save &amp; retry. Your fixes are kept on this computer (.state/providers/{d.providerId}.json) and override the built-in ones.</p>

        {STEPS.map((s) => {
          const r: DiagResult | undefined = d.results[s.id];
          const running = d.running === s.id;
          return (
            <section class={`diag-step${r ? (r.pass ? ' pass' : ' fail') : ''}`}>
              <div class="diag-step-hd">
                <span class="diag-mark">{running ? <span class="spinner" /> : r ? (r.pass ? '✓' : '✗') : '·'}</span>
                <div>
                  <b>{s.title}</b>
                  <small>{s.what}</small>
                </div>
                <button class="btn" disabled={!!d.running} onClick={() => run('/api/diag/run', { step: s.id })}>
                  {r ? 'Run again' : 'Run'}
                </button>
              </div>
              {r && (
                <div class="diag-body">
                  <div class="diag-summary">{r.summary}</div>
                  {Object.keys(r.facts).length > 0 && (
                    <dl class="facts">
                      {Object.entries(r.facts).map(([k, v]) => (
                        <>
                          <dt>{k}</dt>
                          <dd title={String(v)}>{String(v)}</dd>
                        </>
                      ))}
                    </dl>
                  )}
                  {!r.pass && r.fields.length > 0 && (
                    <div class="fields">
                      {r.fields.map((f) => (
                        <label>
                          <span>{f}</span>
                          <input value={edits[f] ?? (d.values[f] === null || d.values[f] === undefined ? '' : String(d.values[f]))} onInput={(e) => setEdits({ ...edits, [f]: (e.target as HTMLInputElement).value })} spellcheck={false} />
                        </label>
                      ))}
                      <div class="actions">
                        <span class="grow" />
                        <button class="btn primary" disabled={!r.fields.some((f) => f in edits)} onClick={() => save(draft())}>
                          Save &amp; retry
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {msg && <div class="note ok-note">{msg}</div>}

        <h5>Advanced</h5>
        {json === null ? (
          <button class="btn" onClick={() => setJson(JSON.stringify(d.override, null, 2))}>
            Edit all fixes as JSON
          </button>
        ) : (
          <div class="json-edit">
            <textarea value={json} onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)} spellcheck={false} />
            <div class="actions">
              <button class="btn" onClick={() => setJson(null)}>
                Cancel
              </button>
              <span class="grow" />
              <button
                class="btn primary"
                onClick={() => {
                  try {
                    void save(JSON.parse(json));
                  } catch (err) {
                    onError(`Not valid JSON: ${String(err)}`);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <h5>Send your fixes</h5>
        <p class="note">Exports your fixes and these results to a file in Documents\RedZone. It has no passwords, cookies or page text, and addresses are cut to the site and page. Send it to the project owner so everyone gets the fix.</p>
        <div class="actions">
          <button class="btn primary" onClick={() => run('/api/diag/export')}>
            Export config
          </button>
          {d.exportPath && <span class="note">Saved {d.exportPath}</span>}
        </div>
      </aside>
    </div>
  );
}
