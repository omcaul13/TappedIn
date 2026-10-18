// RedZone hotkeys inside a tile window (installed on every page load of the tile).
// Alt+P panel · Alt+1..4 sound to screen · Alt+A audio mode · Alt+L lock/unlock · Alt+H home
// Alt+N skip to the best other game · Alt+B "this is a break" · Alt+V "this is live"
// Messages go to the app through the window.rzCall binding (no network request from the page).
(() => {
  if (window !== window.top || window.__rzHotkeys) return;
  window.__rzHotkeys = true;
  const KEYS = { p: 'panel', a: 'audioMode', l: 'lock', h: 'home', n: 'skip', b: 'labelBreak', v: 'labelLive', 1: 'audio1', 2: 'audio2', 3: 'audio3', 4: 'audio4' };
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const k = KEYS[(e.code || '').replace(/^(Key|Digit|Numpad)/, '').toLowerCase()];
      if (!k || typeof window.rzCall !== 'function') return;
      e.preventDefault();
      e.stopPropagation();
      window.rzCall({ type: 'hotkey', key: k });
    },
    true,
  );
})();
