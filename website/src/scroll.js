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

/** The page scroll position that shows step i of a scene at `top` (page coordinates): the middle of that step. */
export function stepScrollY(i, steps, top, height, viewport) {
  const run = height > viewport ? height - viewport : height;
  return Math.round(top + (run * (i + 0.5)) / steps);
}

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
      if (el.dataset.step === step) continue;
      el.dataset.step = step;
      // The rail: the current step, and the ones already passed.
      el.querySelectorAll('.rail button').forEach((b, i) => {
        b.classList.toggle('done', i < Number(step));
        if (String(i) === step) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
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
    el.dataset.step = '';
    io.observe(el);
    // Rail buttons scroll to their step (smoothly unless reduced motion; the step's state follows from the scroll).
    for (const b of el.querySelectorAll('.rail button')) {
      b.addEventListener('click', () => {
        const r = el.getBoundingClientRect();
        const top = stepScrollY(Number(b.dataset.go), Number(el.dataset.steps) || 1, r.top + scrollY, r.height, document.documentElement.clientHeight);
        scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    }
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

/** Wayfinding on every page: how far down you are (--read, the nav's hairline) and which section you're in (aria-current on its nav link). */
function wayfinding() {
  const root = document.documentElement;
  root.classList.add('js');
  let queued = false;
  const read = () => {
    queued = false;
    const max = root.scrollHeight - root.clientHeight;
    root.style.setProperty('--read', max > 0 ? (scrollY / max).toFixed(4) : '0');
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(read);
    }
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  read();

  const links = [...document.querySelectorAll('.nav nav a')];
  for (const a of links) if (new URL(a.href).pathname === location.pathname && !new URL(a.href).hash) a.setAttribute('aria-current', 'page');
  if (typeof IntersectionObserver === 'undefined') return;
  const byId = new Map();
  for (const a of links) {
    const u = new URL(a.href);
    if (u.pathname !== location.pathname || !u.hash) continue;
    const id = u.hash.slice(1);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(a);
  }
  const mark = (id) => {
    for (const [key, as] of byId) for (const a of as) key === id ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current');
  };
  // A section is "current" while it crosses the middle band of the viewport.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) mark(e.target.id);
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of byId.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
  // Above the first linked section (the hero), nothing is current.
  const first = document.getElementById([...byId.keys()][0] ?? '');
  if (first) new IntersectionObserver(([e]) => { if (e.boundingClientRect.top > 0 && !e.isIntersecting) mark(null); }).observe(first);
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

if (typeof document !== 'undefined') {
  wayfinding();
  init();
}
