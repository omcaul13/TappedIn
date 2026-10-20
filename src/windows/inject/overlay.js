// Draws TappedIn's overlay on a tile: a small state badge, an error card when needed, and the
// game-over pop-up (pick the next home game; auto-pick countdown).
// Function expression evaluated as `(OVERLAY)(state)`; plain JS so nothing is transformed.
// Lives in a shadow root at max z-index; only the pop-up takes clicks, so the player is untouched.
// Returns { popupVisible } so the app can fall back to a local picker page if the player covers it.
(state) => {
  const ID = 'rz-overlay-host';
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    host.attachShadow({ mode: 'open' });
    (document.body || document.documentElement).appendChild(host);
  }
  const root = host.shadowRoot;
  if (!host.__rzClicks) {
    host.__rzClicks = true;
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('button');
      if (!b || typeof window.rzCall !== 'function') return;
      if (b.dataset.id) window.rzCall({ type: 'pick', gameId: b.dataset.id });
      else if (b.dataset.act === 'keep') window.rzCall({ type: 'keep' });
    });
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tones = { live: '#1f9d55', break: '#d97706', halftime: '#2563eb', final: '#4b5563', error: '#dc2626', data: '#7c3aed', idle: '#374151' };
  const b = state && state.badge;
  const e = state && state.error;
  const p = state && state.popup;
  const row = (g) => `<button data-id="${esc(g.id)}"><b>${esc(g.label)}</b><span>${esc(g.detail)}</span></button>`;
  root.innerHTML = `<style>
    .badge{position:absolute;top:8px;left:8px;display:flex;gap:6px;align-items:center;font:700 12px/1 system-ui,sans-serif;
      color:#fff;padding:6px 9px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.45);letter-spacing:.02em;max-width:70%;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.92}
    .err{position:absolute;inset:18% 10%;background:rgba(127,29,29,.94);color:#fff;border:2px solid #fca5a5;border-radius:12px;
      padding:18px 22px;font:500 15px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.6)}
    .err b{display:block;font-size:20px;margin-bottom:6px}.err small{display:block;margin-top:10px;opacity:.85}
    .pop{pointer-events:auto;position:absolute;inset:36px 18px 14px;background:rgba(11,15,20,.96);color:#e6edf3;border:1px solid #334155;
      border-radius:12px;display:flex;flex-direction:column;font:500 13px/1.3 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.7)}
    .ph{display:flex;justify-content:space-between;align-items:baseline;padding:10px 14px 6px;gap:10px}
    .ph b{font-size:16px}.cd{color:#fbbf24;font-weight:700;white-space:nowrap}
    .list{overflow:auto;padding:0 10px 6px;flex:1}
    h4{margin:8px 4px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b9bb0}
    .list button{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;background:#121923;color:inherit;
      border:1px solid #223042;border-radius:8px;padding:7px 10px;margin:3px 0;cursor:pointer;font:inherit}
    .list button:hover{border-color:#60a5fa;background:#16202d}.list span{color:#8b9bb0;white-space:nowrap}
    .foot{display:flex;justify-content:flex-end;padding:6px 12px 10px}
    .ghost{background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}
  </style>
  ${b ? `<div class="badge" style="background:${tones[b.tone] || tones.idle}">${esc(b.text)}</div>` : ''}
  ${e ? `<div class="err"><b>${esc(e.title)}</b>${esc(e.detail)}<small>${esc(e.hint)}</small></div>` : ''}
  ${p ? `<div class="pop"><div class="ph"><b>${esc(p.title)}</b><span class="cd" id="cd"></span></div>
      <div class="list">${p.live.length ? '<h4>Live now</h4>' + p.live.map(row).join('') : ''}${p.later.length ? '<h4>Later today</h4>' + p.later.map(row).join('') : ''}
      ${!p.live.length && !p.later.length ? '<h4>No other watchable games today</h4>' : ''}</div>
      <div class="foot"><button class="ghost" data-act="keep">Not now (stay on this channel)</button></div></div>` : ''}`;

  clearInterval(host.__rzTimer);
  if (p && p.autoPickInMs != null) {
    const deadline = Date.now() + p.autoPickInMs;
    const paint = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      const el = root.getElementById('cd');
      if (el) el.textContent = `best live game in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    };
    paint();
    host.__rzTimer = setInterval(paint, 1000);
  }

  let popupVisible = false;
  if (p) {
    const pop = root.querySelector('.pop');
    const r = pop.getBoundingClientRect();
    popupVisible = r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === host && !document.fullscreenElement;
  }
  return { popupVisible };
}
