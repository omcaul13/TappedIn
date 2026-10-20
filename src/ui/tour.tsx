import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

// How to use TappedIn, in a few tips. Setup plays them as a slideshow while it checks the service;
// the first time the app opens they point at the real screens and buttons. Settings → Advanced can
// show them again.

interface Tip {
  title: string;
  text: string;
  /** What the tip points at in the app (the first match that's on screen); none: centered. */
  target: string | null;
}

export const TIPS: Tip[] = [
  {
    title: 'Up to four games, one window',
    text: 'Each screen follows its own game. When that game goes to a long commercial break, TappedIn switches the screen to the best other live game, then back when play resumes.',
    target: '.grid .cell',
  },
  {
    title: 'Pick what a screen follows',
    text: "Move the mouse over a screen and click the game name at its top left to choose another game or sport.",
    target: '.grid .cell .picker-btn',
  },
  {
    title: 'Lock, sound and fullscreen',
    text: 'The buttons at the top right of a screen: the lock stops automatic switching there, the speaker plays its sound. Double-click a screen (or press 1–4) to make it fullscreen.',
    target: '.grid .cell',
  },
  {
    title: 'Halftime and final whistle',
    text: 'At halftime a screen plays a highlights reel. When its game ends, a picker asks what to watch next.',
    target: null,
  },
  {
    title: 'Settings',
    text: 'How eagerly screens switch, which sports you follow, the tickers and your TV service. Press S any time.',
    target: '[data-tour="settings"]',
  },
];

const SEEN_KEY = 'tappedin.tipsSeen';

export function tipsSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private storage: the tips just show again next time.
  }
}

function Dots({ at, onPick }: { at: number; onPick(i: number): void }) {
  return (
    <span class="tour-dots">
      {TIPS.map((_, i) => (
        <button class={i === at ? 'on' : ''} onClick={() => onPick(i)} aria-label={`Tip ${i + 1}`} />
      ))}
    </span>
  );
}

/** Setup's slideshow: a new tip every few seconds, or pick one. */
export function TipCarousel() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAt((i) => (i + 1) % TIPS.length), 7000);
    return () => clearTimeout(t);
  }, [at]);
  const tip = TIPS[at];
  return (
    <div class="tour-slide">
      <div class="tour-slide-body" key={at}>
        <b>{tip.title}</b>
        <p>{tip.text}</p>
      </div>
      <Dots at={at} onPick={setAt} />
    </div>
  );
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function find(selector: string | null): Box | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

const CARD_W = 320;
const CARD_H = 170;

/** Where the tip card goes: below or above a small target, inside a big one, centered for none. */
function place(box: Box | null): { top: number; left: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const clampX = (x: number) => Math.max(12, Math.min(W - CARD_W - 12, x));
  if (!box) return { top: (H - CARD_H) / 2, left: (W - CARD_W) / 2 };
  if (box.height > H * 0.3) return { top: box.top + (box.height - CARD_H) / 2, left: clampX(box.left + (box.width - CARD_W) / 2) };
  const below = box.top + box.height + 12;
  return { top: below + CARD_H < H ? below : Math.max(12, box.top - CARD_H - 12), left: clampX(box.left + box.width / 2 - CARD_W / 2) };
}

/** First-use tips, pointing at the real thing. Closing or finishing them marks them seen. */
export function FirstUseTips({ onDone }: { onDone(): void }) {
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const tip = TIPS[at];
  useLayoutEffect(() => {
    const measure = () => setBox(find(tip.target));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [at]);
  const done = () => {
    markSeen();
    onDone();
  };
  const last = at === TIPS.length - 1;
  const pos = place(box);
  return (
    <div class="tour">
      {box ? <div class="tour-ring" style={{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }} /> : <div class="tour-dim" />}
      <div class="tour-card" role="dialog" aria-label={tip.title} style={{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${CARD_W}px` }}>
        <span class="tour-count">
          Tip {at + 1} of {TIPS.length}
        </span>
        <b>{tip.title}</b>
        <p>{tip.text}</p>
        <div class="tour-actions">
          <button class="btn" onClick={done}>
            Skip
          </button>
          <span class="grow" />
          {at > 0 && (
            <button class="btn" onClick={() => setAt(at - 1)}>
              Back
            </button>
          )}
          <button class="btn primary" onClick={() => (last ? done() : setAt(at + 1))} autoFocus>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
