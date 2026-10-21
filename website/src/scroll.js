// Scroll story: each [data-scene] is a tall section whose .stage sticks while you scroll through it. This sets
// --p (0 to 1, how far through the scene you are) and data-step (which of its data-steps states shows) on the
// scene, so style.css can crossfade and move things with transform and opacity only. [data-reveal] elements fade
// in once when they enter the viewport; [data-count] numbers count up. With reduced motion (or no JS) none of
// this runs and the page is the plain stacked version style.css draws by default.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/** How far through a scene the viewport is: 0 when its top reaches the top, 1 when its bottom reaches the bottom. */
export function sceneProgress(top, height, viewport) {
  const run = height - viewport;
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
    const vh = innerHeight;
    for (const el of live) {
      const r = el.getBoundingClientRect();
      const p = sceneProgress(r.top, r.height, vh);
      el.style.setProperty('--p', p.toFixed(4));
      const steps = Number(el.dataset.steps) || 1;
      const step = String(stepAt(p, steps));
      if (el.dataset.step !== step) el.dataset.step = step;
    }
  };
  const queue = () => {
    if (!queued) {
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
  if (reduce.matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion', 'motion-ready');
  scenes();
  reveals();
}

if (typeof document !== 'undefined') init();
