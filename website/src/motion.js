// Motion for every page. Always: wayfinding (the nav's read hairline, the current section's link), the floodlit
// field (field.js) and the home page's switch demo, which plays itself and can be paused or stepped by hand.
// Unless reduced motion is on: Lenis smooth scrolling and GSAP (vendored in /vendor) for the hero's entrance,
// scroll-scrubbed parallax, wipes and reveals. Nothing is pinned: the page always scrolls at its own height.
// Without JS, or if the libraries fail to load, the page is the plain static version style.css draws by default.
import { startField } from './field.js';

/** How long each beat of the switch demo shows: your game, the break, the fill-in, back on your game. */
export const DEMO_MS = [3200, 3400, 4800, 3400];

/** Which beat shows `elapsed` ms into the looping demo, and how far through it (0 to 1). */
export function demoAt(elapsed, durations = DEMO_MS) {
  const total = durations.reduce((a, b) => a + b, 0);
  let e = ((elapsed % total) + total) % total;
  for (let step = 0; step < durations.length; step++) {
    if (e < durations[step]) return { step, t: e / durations[step] };
    e -= durations[step];
  }
  return { step: durations.length - 1, t: 1 };
}

/** Where beat i starts in the loop, in ms. */
export const demoStart = (i, durations = DEMO_MS) => durations.slice(0, i).reduce((a, b) => a + b, 0);

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
  // Above the first linked section, nothing is current.
  const first = document.getElementById([...byId.keys()][0] ?? '');
  if (first) new IntersectionObserver(([e]) => { if (e.boundingClientRect.top > 0 && !e.isIntersecting) mark(null); }).observe(first);
}

/** The switch demo: data-step on [data-demo] picks the beat (style.css draws it), --t fills the rail. */
function demo(field, reduce) {
  const el = document.querySelector('[data-demo]');
  if (!el) return;
  el.classList.add('live');
  const rail = [...el.querySelectorAll('[data-go]')];
  const toggle = el.querySelector('[data-play]');
  // Reduced motion: nothing plays by itself. It opens on the fill-in, the most telling beat.
  let playing = !reduce;
  let at = reduce ? demoStart(2) : 0;
  let visible = false;
  let last = 0;
  let raf = 0;
  const show = () => {
    const { step, t } = demoAt(at);
    el.style.setProperty('--t', playing ? t.toFixed(3) : '1');
    if (el.dataset.step === String(step)) return;
    el.dataset.step = String(step);
    rail.forEach((b, i) => {
      b.classList.toggle('done', i < step);
      if (i === step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    field?.warm(visible && step === 1);
  };
  const tick = (now) => {
    raf = 0;
    if (!playing || !visible) return;
    at += Math.min(100, now - last);
    last = now;
    show();
    raf = requestAnimationFrame(tick);
  };
  const run = () => {
    if (playing && visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  const go = (i) => {
    at = demoStart(i) + 1;
    show();
  };
  rail.forEach((b, i) => b.addEventListener('click', () => go(i)));
  el.querySelectorAll('.beats > li').forEach((li, i) => li.addEventListener('click', (e) => !e.target.closest('a') && go(i)));
  if (toggle) {
    toggle.hidden = reduce;
    toggle.addEventListener('click', () => {
      playing = !playing;
      toggle.setAttribute('aria-pressed', String(!playing));
      toggle.querySelector('span').textContent = playing ? 'Pause' : 'Play';
      show();
      run();
    });
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    field?.warm(visible && el.dataset.step === '1');
    run();
  }, { threshold: 0.25 }).observe(el);
  show();
}

const load = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`couldn't load ${src}`));
    document.head.appendChild(s);
  });

/** The full motion layer: Lenis + GSAP. Throws if a library doesn't load (the page stays static). */
async function rich() {
  const root = document.documentElement;
  for (const lib of ['gsap', 'ScrollTrigger', 'SplitText', 'lenis']) await load(`/vendor/${lib}.min.js`);
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  // Split text measures lines, so wait for the fonts (but not forever).
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
  // The head script gave up waiting (slow network): stay static rather than hide what's already showing.
  if (!root.classList.contains('motion')) return;

  const lenis = new Lenis({ lerp: 0.11, anchors: { offset: -76 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const fine = matchMedia('(pointer: fine)').matches;
  const ease = 'expo.out';

  // ---- the entrance: the headline rises out of its lines, then the copy, then the screen swings up ----
  const intro = gsap.timeline({ defaults: { ease } });
  const h1 = document.querySelector('h1[data-split]');
  if (h1) {
    const s = SplitText.create(h1, { type: 'lines,words,chars', mask: 'lines', linesClass: 'ln' });
    intro.from(s.chars, { yPercent: 118, rotate: 8, duration: 1.3, stagger: 0.022 }, 0.05);
  }
  intro.from('[data-intro]', { y: 28, autoAlpha: 0, duration: 1.1, stagger: 0.07 }, 0.4);
  intro.from('.hero-shot .frame', { y: 140, autoAlpha: 0, scale: 0.94, duration: 1.8 }, 0.5);
  root.classList.add('motion-ready');

  // ---- the hero screen: tilts toward the pointer, and lies flat as you scroll into it ----
  const shot = document.querySelector('.hero-shot');
  if (shot) {
    gsap.fromTo(shot, { rotateX: 16, scale: 0.94 }, { rotateX: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: shot, start: 'top 90%', end: 'top 15%', scrub: 0.6 } });
    const tilt = shot.querySelector('.tilt');
    if (fine && tilt) {
      const rx = gsap.quickTo(tilt, 'rotateX', { duration: 0.8, ease: 'power3' });
      const ry = gsap.quickTo(tilt, 'rotateY', { duration: 0.8, ease: 'power3' });
      shot.addEventListener('pointermove', (e) => {
        const r = shot.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        rx(-y * 7);
        ry(x * 9);
        tilt.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
        tilt.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
      });
      shot.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    }
  }

  // ---- section titles rise out of their lines ----
  for (const h of document.querySelectorAll('h2[data-split]')) {
    const s = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'ln' });
    gsap.from(s.lines, { yPercent: 110, duration: 1.2, ease, stagger: 0.1, scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
  }

  // ---- reveals: a block's children come in one after another, once ----
  for (const el of document.querySelectorAll('[data-reveal]')) {
    const kids = el.matches('ul, ol') ? el.querySelectorAll(':scope > *') : [el];
    gsap.from(kids, {
      y: 36, autoAlpha: 0, duration: 1, ease, stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true, onEnter: () => el.querySelectorAll('[data-count]').forEach(count) },
    });
  }

  // ---- the grid: opens like an iris as it scrolls in ----
  for (const el of document.querySelectorAll('.iris')) {
    const st = { trigger: el, start: 'top 95%', end: 'center 60%', scrub: 0.5 };
    gsap.fromTo(el.querySelector('.frame'), { clipPath: 'inset(12% 16% 12% 16% round 40px)' }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(el.querySelector('img'), { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: st });
  }

  // ---- parallax: [data-speed] drifts against the scroll ----
  for (const el of document.querySelectorAll('[data-speed]')) {
    const d = Number(el.dataset.speed) * 50;
    gsap.fromTo(el, { y: d }, { y: -d, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  // ---- the tiers: each big numeral fills with light as it passes; the meter runs up ----
  for (const n of document.querySelectorAll('.tier .n')) {
    gsap.fromTo(n, { '--fill': '0%' }, { '--fill': '100%', ease: 'none', scrollTrigger: { trigger: n, start: 'top 85%', end: 'top 45%', scrub: true } });
  }
  for (const m of document.querySelectorAll('.meter .track i')) {
    gsap.fromTo(m, { scaleX: 0 }, { scaleX: 0.86, duration: 1.6, ease, scrollTrigger: { trigger: m, start: 'top 85%', once: true } });
  }

  // ---- setup: the line through the four steps draws itself ----
  for (const el of document.querySelectorAll('.steps')) {
    gsap.fromTo(el, { '--draw': 0 }, { '--draw': 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 60%', scrub: true } });
  }

  // ---- the league ticker runs faster while you scroll ----
  const tracks = [...document.querySelectorAll('.ticker ul')].flatMap((u) => u.getAnimations());
  lenis.on('scroll', ({ velocity }) => {
    for (const a of tracks) a.playbackRate = 1 + Math.min(6, Math.abs(velocity) * 0.25);
  });

  if (!fine) return;
  // ---- magnetic download buttons ----
  for (const b of document.querySelectorAll('.btn-xl, .nav .btn-primary')) {
    const x = gsap.quickTo(b, 'x', { duration: 0.5, ease: 'power3' });
    const y = gsap.quickTo(b, 'y', { duration: 0.5, ease: 'power3' });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.22);
      y((e.clientY - r.top - r.height / 2) * 0.3);
    });
    b.addEventListener('pointerleave', () => {
      gsap.to(b, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    });
  }
  // ---- cards light up under the pointer ----
  for (const c of document.querySelectorAll('.lit')) {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

/** Counts a number up to its data-count over about a second (its text already holds the final value). */
function count(el) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to)) return;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1100);
    el.textContent = String(Math.round(to * (1 - (1 - t) ** 4)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function init() {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  wayfinding();
  let field = null;
  const canvas = document.querySelector('.field canvas');
  try {
    if (canvas) field = startField(canvas, { reduce });
  } catch (e) {
    console.warn('field:', e);
  }
  demo(field, reduce);
  // The head script adds .motion before first paint (not under reduced motion) and takes it off after 4 s if this hasn't started.
  if (reduce || !root.classList.contains('motion')) return;
  rich().catch((e) => {
    console.warn('motion:', e);
    root.classList.remove('motion');
  });
}

if (typeof document !== 'undefined') init();
