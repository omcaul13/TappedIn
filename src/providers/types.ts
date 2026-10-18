import { z } from 'zod';

// A provider is one TV streaming service (Xfinity On Campus, Spectrum, …). Everything fragile about its
// web player (URLs, selectors, timings, error text, sign-in rules) lives in config/providers/<id>.json,
// so a site change can be fixed without touching code. A user's fixes go in .state/providers/<id>.json.

/** A regular expression written as a string: "source" (case-insensitive) or "/source/flags". */
export const RegexSource = z.string().refine((s) => {
  try {
    compileRegex(s);
    return true;
  } catch {
    return false;
  }
}, 'not a valid regular expression');

/** "abc" → /abc/i; "/abc/" → /abc/; "/abc/g" → /abc/g. */
export function compileRegex(src: string, defaultFlags = 'i'): RegExp {
  const m = /^\/(.*)\/([dgimsuvy]*)$/s.exec(src);
  return m ? new RegExp(m[1], m[2]) : new RegExp(src, defaultFlags);
}

export const ProviderStatusSchema = z.enum(['stable', 'experimental', 'unsupported']);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderFamilySchema = z.enum(['comcast', 'spectrum', 'youtube-tv', 'sling']);
export type ProviderFamily = z.infer<typeof ProviderFamilySchema>;

const ShellSchema = z.object({
  /** Electron session partition: keeps this service's cookies apart from other services'. */
  partition: z.string().min(1),
  /** "chrome": present Chrome's identifier without "Electron/…" (Xfinity rejects Electron's). */
  userAgent: z.enum(['chrome', 'default']).default('chrome'),
  /** Any page of the service's web app (the hide script runs there). */
  appUrl: RegexSource,
  /** A page showing the player: the service's UI is hidden there so the video fills the view. */
  playerUrl: RegexSource,
  /** Extra CSS while the player is up, on top of the built-in "show only the playing video". */
  hideCss: z.string().default(''),
});

const SigninSchema = z.object({
  /** Loaded to check whether the service is still signed in. */
  checkUrl: z.string().url(),
  /** Text near the top of the page that means "signed out" (first 4000 characters). */
  signedOutPattern: RegexSource,
  /** A portal whose button hands the session to the service (Xfinity On Campus "Watch Now"). */
  portalUrl: z.string().url().nullable().default(null),
  /** The portal button RedZone presses for you. Only the user's own hand-off button, never a terms/consent control. */
  autoClick: z.object({ selector: z.string(), text: z.string() }).nullable().default(null),
  /** Shown to the user while the sign-in window is open. */
  instructions: z.string(),
  windowTitle: z.string(),
  checkTimeoutMs: z.number().int().positive().default(20000),
  portalTimeoutMs: z.number().int().positive().default(30000),
  /** Wait after loading checkUrl before reading the page. */
  checkSettleMs: z.number().int().min(0).default(4000),
  /** Wait after the hand-off lands on the service before checking it. */
  handoffSettleMs: z.number().int().min(0).default(5000),
  autoClickTries: z.number().int().min(0).default(30),
  autoClickIntervalMs: z.number().int().positive().default(500),
  /** How long to wait for the service after pressing the portal button… */
  waitAfterClickMs: z.number().int().positive().default(40000),
  /** …or after showing the window for the user to sign in. */
  waitForUserMs: z.number().int().positive().default(600000),
});

const ErrorsSchema = z.object({
  /** Lines of page text matching any of these are reported by the in-page probe. */
  probePatterns: z.array(RegexSource),
  /** The top frame's host + path looks like a sign-in page. */
  loginUrl: RegexSource,
  limit: RegexSource,
  unavailable: RegexSource,
  loginText: RegexSource,
  idlePrompt: RegexSource,
});

const TimingSchema = z.object({
  /** Pause after a full page load before the next one may start. */
  loadGapMs: z.number().int().min(0).default(3500),
  /** Channel changes in progress at once. */
  maxParallelTunes: z.number().int().min(1).default(2),
  /** Delay before parking standby views on the guide after startup. */
  spareWarmDelayMs: z.number().int().min(0).default(20000),
  /** How often the hide script re-picks the playing video. */
  hidePollMs: z.number().int().positive().default(500),
});

export const ProviderConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Used in messages ("Signed out of Xfinity"). */
  shortName: z.string().min(1),
  family: ProviderFamilySchema,
  kind: z.enum(['campus', 'consumer']),
  status: ProviderStatusSchema,
  /** No official logos: initials on a neutral colour. */
  badge: z.object({ initials: z.string().min(1).max(3), color: z.string() }),
  /** Extra words for the service picker's search (school names, plan names). */
  search: z.array(z.string()).default([]),
  /** The limit the service documents, if any (what actually plays is measured). */
  documentedMaxStreams: z.number().int().min(1).nullable().default(null),
  defaults: z.object({ standbyViews: z.number().int().min(0).max(4).default(0) }).prefault({}),
  notes: z.string().default(''),
  shell: ShellSchema,
  signin: SigninSchema,
  errors: ErrorsSchema,
  timing: TimingSchema.prefault({}),
  /** Family-specific tuning details; each adapter validates its own section. */
  tuning: z.record(z.string(), z.unknown()).default({}),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ProviderSummary {
  id: string;
  name: string;
  shortName: string;
  kind: ProviderConfig['kind'];
  status: ProviderStatus;
  badge: ProviderConfig['badge'];
  search: string[];
  documentedMaxStreams: number | null;
}
