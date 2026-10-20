// Where each screen sits in the app window, for 1–4 screens. electron/main.cjs places the video
// views with it, and src/ui/style.css mirrors it (.grid.n1–.n4, .grid.focus) for the overlays drawn
// on top. `top` is the top bar's height (or the big ticker's, when it covers the top bar).
//   1: the whole area        2: two columns
//   3: screen 1 is the left half; 2 and 3 are stacked on the right
//   4: 2x2

/** Rectangles for screens 1..n inside a window of width×height, below a `top` bar, `gap` px apart. */
function cellRects(n, width, height, top, gap) {
  const gh = Math.max(0, height - top);
  const cw = Math.floor((width - gap) / 2);
  const ch = Math.floor((gh - gap) / 2);
  const left = { x: 0, width: cw };
  const right = { x: cw + gap, width: width - cw - gap };
  const upper = { y: top, height: ch };
  const lower = { y: top + ch + gap, height: gh - ch - gap };
  const full = { y: top, height: gh };
  const at = (col, row) => ({ x: col.x, y: row.y, width: col.width, height: row.height });
  switch (Math.max(1, Math.min(4, n))) {
    case 1:
      return [{ x: 0, y: top, width, height: gh }];
    case 2:
      return [at(left, full), at(right, full)];
    case 3:
      return [at(left, full), at(right, upper), at(right, lower)];
    default:
      return [at(left, upper), at(right, upper), at(left, lower), at(right, lower)];
  }
}

/**
 * Where screen `screen` sits: its cell, or (per-screen fullscreen, `focus` = that screen) the whole
 * area below `top`. The other screens keep their cells: their views stay the same size and keep
 * playing underneath the focused one, so going back to the grid is instant.
 */
function screenRect(n, screen, width, height, top, gap, focus) {
  if (focus && focus === screen) return { x: 0, y: top, width, height: Math.max(0, height - top) };
  return cellRects(n, width, height, top, gap)[Math.max(1, Math.min(n, screen)) - 1];
}

module.exports = { cellRects, screenRect };
