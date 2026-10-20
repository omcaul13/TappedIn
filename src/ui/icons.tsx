// Inline icons (stroke = currentColor), 24x24 grid.
const P = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const LockIcon = ({ open = false }: { open?: boolean }) => (
  <svg viewBox="0 0 24 24" {...P}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
  </svg>
);

export const SoundIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6M21 9l-5 6" />}
  </svg>
);

export const GearIcon = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const FullscreenIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" {...P}>
    {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
);

/** The tickers: a strip of scores. */
export const TickerIcon = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M7 10v4M11 10v4M15 10h3M15 14h3" />
  </svg>
);

export const BackIcon = () => (
  <svg viewBox="0 0 24 24" {...P}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

/** A neutral glyph per sport family (no league logos). */
export const SportIcon = ({ family }: { family: string }) => (
  <svg viewBox="0 0 24 24" {...P} class="sport-icon">
    {family === 'football' && (
      <>
        <ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)" />
        <path d="M9.5 14.5l5-5M10.5 11l2.5 2.5M12 9.5l2.5 2.5" />
      </>
    )}
    {family === 'basketball' && (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" />
      </>
    )}
    {family === 'hockey' && (
      <>
        <ellipse cx="12" cy="9" rx="8" ry="3" />
        <path d="M4 9v5c0 1.7 3.6 3 8 3s8-1.3 8-3V9" />
      </>
    )}
    {family === 'baseball' && (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 4.5c2 2.2 2 12.8 0 15M16.5 4.5c-2 2.2-2 12.8 0 15" />
      </>
    )}
    {family === 'tennis' && (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8" />
      </>
    )}
    {family === 'soccer' && (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4zM12 3v4.5M15.5 10l4.8-1.5M14.2 14l2.8 4M9.8 14L7 18M8.5 10L3.7 8.5" />
      </>
    )}
  </svg>
);

// Placeholder TappedIn logo (a signal: a dot and two waves), drawn white on the .mark gradient tile.
// Swap this glyph (and installer/tappedin.ico) for the real logo when it's ready.
export const BrandGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width={2.6} stroke-linecap="round" aria-hidden="true">
    <circle cx="7" cy="17" r="2.2" fill="#fff" stroke="none" />
    <path d="M7 10.5a6.5 6.5 0 0 1 6.5 6.5M7 5a12 12 0 0 1 12 12" />
  </svg>
);
