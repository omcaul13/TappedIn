import { useState } from 'preact/hooks';
import { ServiceBadge, StatusChip } from './onboarding';
import { post, type AppState } from './util';

// Settings drawer, "TV service" tab: which service, its channels, streams and standby views, and the
// ways out when something's wrong (re-scan, re-test, log out, diagnostics, another service).

/** A button that asks once more before doing something disruptive. */
function ConfirmButton({ label, confirm, onConfirm, primary = false }: { label: string; confirm: string; onConfirm(): void; primary?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      class={`btn${primary || armed ? ' primary' : ''}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      title={armed ? '' : confirm}
    >
      {armed ? confirm : label}
    </button>
  );
}

export function ServicePanel({ st, onError }: { st: AppState; onError(m: string): void }) {
  const sv = st.service;
  const me = st.providers.find((p) => p.id === sv.id);
  const [other, setOther] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const run = async (path: string, body: Record<string, unknown> = {}) => {
    setNote(null);
    const r = await post(path, body);
    if (!r.ok) onError(r.message ?? 'that didn\'t work');
    else if (r.message) setNote(r.message);
  };
  const others = st.providers.filter((p) => p.id !== sv.id && p.status !== 'unsupported');
  return (
    <>
      <div class="svc-head">
        {me && <ServiceBadge p={me} size={38} />}
        <div>
          <b>{sv.name}</b>
          <div class="svc-meta">
            <StatusChip status={sv.status} />
            <span>
              {sv.screens} screen{sv.screens === 1 ? '' : 's'}
              {sv.measuredStreams !== null ? ` · ${sv.measuredStreams} stream${sv.measuredStreams === 1 ? '' : 's'} played in the last test` : ''}
              {sv.documentedMaxStreams ? ` · ${sv.documentedMaxStreams} documented` : ''}
            </span>
          </div>
        </div>
      </div>

      <div class="svc-actions">
        <button class="btn" onClick={() => run('/api/service/rescan')} title="Screen 1 shows the guide for a few seconds">
          Re-scan channels
        </button>
        <ConfirmButton label="Re-test streams" confirm="Screens pause ~30 s: click to start" onConfirm={() => run('/api/service/streams')} />
        <button class="btn" onClick={() => run('/api/diag/open')}>
          Diagnostics
        </button>
        <ConfirmButton label="Log out" confirm={`Sign out of ${sv.name}?`} onConfirm={() => run('/api/service/logout')} />
      </div>
      {note && <div class="note ok-note">{note}</div>}

      <h5>Standby views</h5>
      <div class="seg">
        {[0, 1, 2].map((n) => (
          <button class={sv.standbyViews === n ? 'on' : ''} onClick={() => run('/api/service/standby', { n })}>
            {n === 0 ? 'Off' : n}
          </button>
        ))}
      </div>
      <div class="note" style={{ marginTop: '6px' }}>
        Extra hidden streams that make switching instant. Each one counts against your plan's stream limit{sv.measuredStreams !== null ? ` (${sv.measuredStreams} played in the last test)` : ''}.
      </div>

      <h5>Channels</h5>
      {sv.rows.length === 0 && <div class="note">Scan your channels to edit which guide channel carries each network.</div>}
      <div class="mapping">
        {sv.lineup.map((l) => (
          <label>
            <span class={l.number === null ? 'off' : ''}>{l.key}</span>
            {sv.rows.length ? (
              <select value={l.row === null ? '' : String(l.row)} onChange={(e) => run('/api/service/map', { key: l.key, row: (e.target as HTMLSelectElement).value === '' ? null : Number((e.target as HTMLSelectElement).value) })}>
                <option value="">Not in my lineup</option>
                {sv.rows.map((r) => (
                  <option value={String(r.index)}>
                    {r.label}
                    {r.number !== null ? ` · ${r.number}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <em>{l.number === null ? 'not in lineup' : `channel ${l.number}`}</em>
            )}
          </label>
        ))}
      </div>
      {sv.lineupAt && <div class="note">Last scanned {new Date(sv.lineupAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.</div>}

      <h5>Another service</h5>
      <div class="svc-switch">
        <select value={other} onChange={(e) => setOther((e.target as HTMLSelectElement).value)}>
          <option value="">Choose…</option>
          {others.map((p) => (
            <option value={p.id}>
              {p.name}
              {p.status === 'experimental' ? ' (experimental)' : ''}
            </option>
          ))}
        </select>
        {other && <ConfirmButton label="Switch" confirm="Runs setup again: click to switch" onConfirm={() => run('/api/service/switch', { id: other })} />}
      </div>
      <div class="note" style={{ marginTop: '6px' }}>
        Each service keeps its own sign-in, so switching back later doesn't sign you out of this one.
      </div>
    </>
  );
}
