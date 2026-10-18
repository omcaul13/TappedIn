// Phase 0 overlay test: a shadow-DOM badge pinned to the top-left at max z-index.
// Returns whether it is actually the top-most element at its own centre (i.e. visible over the player).
(() => {
  const ID = 'rz-overlay-host';
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    host.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .chip{font:700 13px/1 system-ui,sans-serif;letter-spacing:.04em;color:#fff;background:rgba(200,30,30,.92);
            padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.5)}
    </style><div class="chip">REDZONE TEST BADGE</div>`;
    (document.body || document.documentElement).appendChild(host);
  }
  const r = host.getBoundingClientRect();
  // Hit-testing skips pointer-events:none, so enable it just for the check.
  host.style.pointerEvents = 'auto';
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  host.style.pointerEvents = 'none';
  return { injected: true, rect: { w: Math.round(r.width), h: Math.round(r.height) }, onTop: top === host, topElement: top ? top.tagName + (top.id ? '#' + top.id : '') : null };
})()
