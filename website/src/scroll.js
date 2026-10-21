// Scroll story: each [data-scene] is a tall section whose .stage sticks while you scroll through it. This sets
// --p (0 to 1, how far through the scene you are) and data-step (which of its data-steps states shows) on the
// scene, so style.css can crossfade and move things with transform and opacity only. [data-reveal] elements fade
// in once when they enter the viewport; [data-count] numbers count up. With reduced motion (or no JS) none of
// this runs and the page is the plain stacked version style.css draws by default.

/** How far through a scene the viewport is: 0 when its top reaches the top, 1 when its bottom reaches the bottom.
 *  A scene no taller than the viewport runs while it scrolls out the top instead (no jump from 0 to 1). */
export function sceneProgress(top, height, viewport) {
  const run = height > viewport ? height - viewport : height;
  if (run <= 0) return top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -top / run));
}

/** Which of `steps` states shows at progress p (the last one holds through the end). */
export const stepAt = (p, steps) => Math.min(steps - 1, Math.floor(p * steps));

function scenes() {
  const all = [...document.querySelectorAll('[data-scene]')];
  const live = new Set();
  let queued = false;
  const update = () => {
    queued = false;
    // clientHeight is the small viewport on iOS and Android (what 100svh pins to), and doesn't change with the toolbar.
    const vh = document.documentElement.clientHeight;
    // Measure every scene first, then write, so the writes don't force a layout per scene.
    const at = [...live].map((el) => {
      const r = el.getBoundingClientRect();
      return [el, sceneProgress(r.top, r.height, vh)];
    });
    for (const [el, p] of at) {
      el.style.setProperty('--p', p.toFixed(4));
      const steps = Number(el.dataset.steps) || 1;
      const step = String(stepAt(p, steps));
      if (el.dataset.step !== step) el.dataset.step = step;
    }
  };
  const queue = () => {
    if (!queued && live.size) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  // Only scenes near the viewport are measured each frame.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? live.add(e.target) : live.delete(e.target);
      queue();
    },
    { rootMargin: '20% 0px' },
  );
  for (const el of all) {
    el.dataset.step = '0';
    io.observe(el);
  }
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
}

function reveals() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
        const n = e.target.matches('[data-count]') ? [e.target] : [...e.target.querySelectorAll('[data-count]')];
        n.forEach(count);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  for (const el of document.querySelectorAll('[data-reveal]')) io.observe(el);
}

/** Counts a number up to its data-count over about a second (its text already holds the final value). */
function count(el) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to)) return;
  const start = performance.now();
  const ms = 900;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = String(Math.round(to * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function init() {
  const root = document.documentElement;
  // index.html's head script adds .motion before first paint (not under reduced motion or without IntersectionObserver)
  // and takes it off after 4 s if this hasn't started. Starting later than that would jump the layout: stay static.
  if (!root.classList.contains('motion') || typeof IntersectionObserver === 'undefined') return;
  root.classList.add('motion-ready');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  reduce.addEventListener?.('change', () => reduce.matches && root.classList.remove('motion'));
  scenes();
  reveals();
}

if (typeof document !== 'undefined') init();
