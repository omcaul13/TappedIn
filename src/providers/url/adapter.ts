import type { Page } from 'playwright-core';
import { z } from 'zod';
import { compileRegex, type ChannelRef, type DiscoveredChannel, type ProviderAdapter, type ProviderConfig, type TuneOutcome, type TuneTools } from '../types';

// Services whose web player has a stable URL per channel (Spectrum ?tmsid=, YouTube TV /watch/<id>,
// Sling /1/channel/<guid>/watch). A channel change is one page load. The channel's id comes from a
// lineup scan, which reads it from the guide: either from the page (a row selector plus an attribute
// and a pattern) or from the guide data the page itself downloads (a URL pattern plus field paths).
// All of it is config, so a site change is fixed in config/providers/<id>.json (or a user override).

const DomLineup = z.object({
  mode: z.literal('dom'),
  guideUrl: z.string().url(),
  /** One element per channel. */
  row: z.string(),
  label: z.object({ selector: z.string().nullable().default(null), attr: z.string().nullable().default(null) }).prefault({}),
  number: z.object({ selector: z.string().nullable().default(null), attr: z.string().nullable().default(null) }).nullable().default(null),
  /** Where the channel id is: an attribute of the row (or of `selector` inside it), cut out with `pattern` (group 1). */
  ref: z.object({ selector: z.string().nullable().default(null), attr: z.string(), pattern: z.string().nullable().default(null) }),
  /** Element to scroll for virtualized guides (default: the page). */
  scrollContainer: z.string().nullable().default(null),
  settleMs: z.number().int().min(0).default(300),
  maxScrolls: z.number().int().min(0).default(200),
});

const ResponseLineup = z.object({
  mode: z.literal('response'),
  guideUrl: z.string().url(),
  /** The guide data request the page makes (regex on its URL). */
  responseUrl: z.string(),
  /** Paths into that JSON: "a.b[].c" walks objects and every element of [] arrays. */
  items: z.string(),
  ref: z.string(),
  label: z.string(),
  number: z.string().nullable().default(null),
  refPattern: z.string().nullable().default(null),
  timeoutMs: z.number().int().positive().default(30000),
});

export const UrlTuningSchema = z.object({
  /** The channel's live URL; {ref} is replaced by its id. */
  watchUrl: z.string().includes('{ref}'),
  /** Finds the channel id in a player URL (group 1), to check where a tune landed. */
  refInUrl: z.string(),
  pageTimeoutMs: z.number().int().positive().default(30000),
  /** A button answering "Are you still watching?", if the service has one. */
  idlePromptButton: z.string().nullable().default(null),
  lineup: z.discriminatedUnion('mode', [DomLineup, ResponseLineup]),
});
export type UrlTuning = z.infer<typeof UrlTuningSchema>;

/** Group 1 of `pattern` in `text` (the whole text when there is no pattern), or null. */
export function refFromText(text: string | null | undefined, pattern: string | null): string | null {
  if (!text) return null;
  if (!pattern) return text.trim() || null;
  const m = compileRegex(pattern, '').exec(text);
  return m?.[1] ?? null;
}

/** Every value at `path` ("a.b[].c": objects by key, [] = each element of an array). */
export function collectPath(root: unknown, path: string): unknown[] {
  let cur: unknown[] = [root];
  for (const part of path.split('.').filter(Boolean)) {
    const each = part.endsWith('[]');
    const key = each ? part.slice(0, -2) : part;
    const next: unknown[] = [];
    for (const v of cur) {
      const got = key ? (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined) : v;
      if (each) {
        if (Array.isArray(got)) next.push(...got);
      } else if (got !== undefined) next.push(got);
    }
    cur = next;
  }
  return cur;
}

export function itemsFromJson(json: unknown, paths: { items: string; ref: string; label: string; number: string | null; refPattern: string | null }): DiscoveredChannel[] {
  const out: DiscoveredChannel[] = [];
  for (const item of collectPath(json, paths.items)) {
    const ref = refFromText(String(collectPath(item, paths.ref)[0] ?? ''), paths.refPattern);
    if (!ref) continue;
    const n = paths.number ? Number(collectPath(item, paths.number)[0]) : NaN;
    out.push({ label: String(collectPath(item, paths.label)[0] ?? ref), number: Number.isFinite(n) && n > 0 ? n : null, callSign: null, ref });
  }
  return out;
}

export function createUrlAdapter(config: ProviderConfig): ProviderAdapter {
  const parsed = UrlTuningSchema.safeParse(config.tuning);
  if (!parsed.success) throw new Error(`config/providers/${config.id}.json tuning: ${z.prettifyError(parsed.error)}`);
  const t = parsed.data;
  const player = compileRegex(config.shell.playerUrl);
  const refInUrl = compileRegex(t.refInUrl, '');

  const onChannel = (url: string, ch: ChannelRef): boolean => {
    if (!ch.ref) return true;
    const m = refInUrl.exec(url);
    return m ? decodeURIComponent(m[1]) === ch.ref : true;
  };

  return {
    config,
    onChannel,
    isOnPlayer: (url) => player.test(url),
    isWarm: () => false,
    warm: async () => {},
    release: async () => false,

    async answerIdlePrompt(page: Page): Promise<boolean> {
      if (!t.idlePromptButton) return false;
      const button = page.locator(t.idlePromptButton).first();
      try {
        if (!(await button.count())) return false;
        await button.dispatchEvent('click');
        return true;
      } catch {
        return false;
      }
    },

    async tune(page: Page, ch: ChannelRef, tools: TuneTools): Promise<TuneOutcome> {
      const t0 = Date.now();
      if (!ch.ref) throw new Error(`${config.shortName}: no channel id for ${ch.name}; run a lineup scan`);
      await tools.load(page, t.watchUrl.replace('{ref}', encodeURIComponent(ch.ref)), t.pageTimeoutMs);
      if (!onChannel(page.url(), ch)) throw new Error(`${config.shortName} opened ${page.url().slice(0, 100)} instead of ${ch.name}`);
      return { path: 'url', ms: Date.now() - t0, url: page.url() };
    },

    async discoverLineup(page: Page, tools: TuneTools): Promise<DiscoveredChannel[]> {
      const l = t.lineup;
      if (l.mode === 'response') {
        const re = compileRegex(l.responseUrl);
        const response = page.waitForResponse((r) => re.test(r.url()), { timeout: l.timeoutMs });
        await tools.load(page, l.guideUrl, t.pageTimeoutMs);
        return itemsFromJson(await (await response).json(), { items: l.items, ref: l.ref, label: l.label, number: l.number, refPattern: l.refPattern });
      }
      await tools.load(page, l.guideUrl, t.pageTimeoutMs);
      await page.waitForSelector(l.row, { timeout: t.pageTimeoutMs });
      const rows = (await page.evaluate(`(${READ_ROWS})(${JSON.stringify(l)})`)) as { label: string; number: string | null; ref: string | null }[];
      const seen = new Set<string>();
      const out: DiscoveredChannel[] = [];
      for (const r of rows) {
        const ref = refFromText(r.ref, l.ref.pattern);
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);
        const n = Number(r.number);
        out.push({ label: r.label, number: Number.isFinite(n) && n > 0 ? n : null, callSign: null, ref });
      }
      return out;
    },
  };
}

/** Runs in the page: scroll through the guide and read every row (label, number, raw id text). */
const READ_ROWS = `async (l) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (row, spec) => {
    if (!spec) return null;
    const el = spec.selector ? row.querySelector(spec.selector) : row;
    if (!el) return null;
    return spec.attr ? el.getAttribute(spec.attr) : (el.textContent || '').trim().replace(/\\s+/g, ' ');
  };
  const box = l.scrollContainer ? document.querySelector(l.scrollContainer) : document.scrollingElement;
  const out = [];
  const seen = new Set();
  for (let i = 0; i <= l.maxScrolls; i++) {
    for (const row of document.querySelectorAll(l.row)) {
      const ref = pick(row, l.ref);
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      out.push({ label: (pick(row, l.label) || '').slice(0, 200), number: pick(row, l.number), ref });
    }
    if (!box || box.scrollTop + box.clientHeight >= box.scrollHeight - 2) break;
    box.scrollTop += Math.max(200, Math.floor(box.clientHeight * 0.8));
    await sleep(l.settleMs);
  }
  return out;
}`;
