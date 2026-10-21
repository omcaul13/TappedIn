import type { Page } from 'playwright-core';
import { z } from 'zod';
import { compileRegex, type ChannelRef, type DiscoveredChannel, type ProviderAdapter, type ProviderConfig, type TuneOutcome, type TuneTools } from '../types';

// Services whose web player has a stable URL per channel (Spectrum ?tmsid=, YouTube TV /watch/<id>,
// Sling /1/channel/<guid>/watch). A channel change is one page load. The channel's id comes from a
// lineup scan, which reads it from the guide: either from the page (a row selector plus an attribute
// and a pattern) or from the guide data the page itself downloads (a URL pattern plus field paths),
// or it is a fixed list (ESPN's ?network= ids). Services with no channel URL (Hulu, DIRECTV) tune with
// `click` instead: open the guide, find the channel's row the same way the DOM scan does, and click it
// (then the service's own play tile), as a user would.
// All of it is config, so a site change is fixed in config/providers/<id>.json (or a user override).

const DomLineup = z.object({
  mode: z.literal('dom'),
  guideUrl: z.string().url(),
  /** One element per channel. */
  row: z.string(),
  /** The channel's name: text (or `attr`) of the row or of `selector` inside it, optionally cut out with `pattern` (group 1). */
  label: z.object({ selector: z.string().nullable().default(null), attr: z.string().nullable().default(null), pattern: z.string().nullable().default(null) }).prefault({}),
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
  /** Only items that have a value here count (e.g. Sling ribbons that can play); "path=value" needs that value (Paramount+ "channelTypes[]=live_local"). */
  require: z.string().nullable().default(null),
  /** Guides that load their data as you scroll: scroll this element and collect every response. */
  scrollContainer: z.string().nullable().default(null),
  settleMs: z.number().int().min(0).default(300),
  maxScrolls: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().positive().default(30000),
});

const StaticLineup = z.object({
  mode: z.literal('static'),
  /** Every channel the service has, with its id (for players whose channel ids are documented, not in a guide). */
  channels: z.array(z.object({ label: z.string().min(1), ref: z.string().min(1) })).min(1),
});

const ClickTune = z.object({
  /** Clicked once after the guide loads, before looking for the row (e.g. Hulu's Channels tab). */
  before: z.string().nullable().default(null),
  /** Clicked for the channel: `selector` inside the row's `closest` ancestor (both null: the row itself). */
  target: z.object({ closest: z.string().nullable().default(null), selector: z.string().nullable().default(null) }).prefault({}),
  /** Clicked once it appears after that (the service's own play / "on now" tile). */
  then: z.string().nullable().default(null),
  /** "mouse": a real click; "dom": element.click(), for pages where an overlay takes mouse clicks. */
  how: z.enum(['mouse', 'dom']).default('mouse'),
});

export const UrlTuningSchema = z
  .object({
    /** The channel's live URL; {ref} is replaced by its id. Null when the service tunes by `click`. */
    watchUrl: z.string().includes('{ref}').nullable().default(null),
    /** Finds the channel id in a player URL (group 1), to check where a tune landed. Null: the URL can't tell. */
    refInUrl: z.string().nullable().default(null),
    pageTimeoutMs: z.number().int().positive().default(30000),
    /** A button answering "Are you still watching?", if the service has one. */
    idlePromptButton: z.string().nullable().default(null),
    click: ClickTune.nullable().default(null),
    lineup: z.discriminatedUnion('mode', [DomLineup, ResponseLineup, StaticLineup]),
  })
  .refine((t) => t.watchUrl || (t.click && t.lineup.mode === 'dom'), 'needs watchUrl, or click with a dom lineup (the row to click)');
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

export function itemsFromJson(json: unknown, paths: { items: string; ref: string; label: string; number: string | null; refPattern: string | null; require?: string | null }): DiscoveredChannel[] {
  const out: DiscoveredChannel[] = [];
  for (const item of collectPath(json, paths.items)) {
    if (paths.require) {
      const [path, want] = paths.require.split('=');
      if (!collectPath(item, path).some((v) => want === undefined || String(v) === want)) continue;
    }
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
  const refInUrl = t.refInUrl ? compileRegex(t.refInUrl, '') : null;

  const onChannel = (url: string, ch: ChannelRef): boolean => {
    if (!ch.ref || !refInUrl) return true;
    const m = refInUrl.exec(url);
    return m ? decodeURIComponent(m[1]) === ch.ref : true;
  };

  const click = async (page: Page, selector: string): Promise<void> => {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: t.pageTimeoutMs });
    if (t.click?.how === 'dom') await el.dispatchEvent('click');
    else await el.click({ timeout: t.pageTimeoutMs });
  };

  /** Load the DOM lineup's guide (and press `click.before`) until its rows show. */
  const openGuide = async (page: Page, tools: TuneTools): Promise<void> => {
    const l = t.lineup;
    if (l.mode !== 'dom') return;
    await tools.load(page, l.guideUrl, t.pageTimeoutMs);
    if (t.click?.before) await click(page, t.click.before);
    await page.waitForSelector(l.row, { timeout: t.pageTimeoutMs });
  };

  const tuneByClick = async (page: Page, ch: ChannelRef, tools: TuneTools): Promise<void> => {
    const c = t.click!;
    await openGuide(page, tools);
    // The page script scrolls the row into view and marks what to click; the click itself is a normal one.
    const found = await page.evaluate(`(${MARK_ROW})(${JSON.stringify({ l: t.lineup, target: c.target, ref: ch.ref })})`);
    if (!found) throw new Error(`${config.shortName}: ${ch.name} isn't in the guide; run a lineup scan`);
    await click(page, `[${MARK}]`);
    if (c.then) await click(page, c.then);
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
      if (!t.watchUrl) {
        await tuneByClick(page, ch, tools);
        return { path: 'guide', ms: Date.now() - t0, url: page.url() };
      }
      await tools.load(page, t.watchUrl.replace('{ref}', encodeURIComponent(ch.ref)), t.pageTimeoutMs);
      if (!onChannel(page.url(), ch)) throw new Error(`${config.shortName} opened ${page.url().slice(0, 100)} instead of ${ch.name}`);
      return { path: 'url', ms: Date.now() - t0, url: page.url() };
    },

    async discoverLineup(page: Page, tools: TuneTools): Promise<DiscoveredChannel[]> {
      const l = t.lineup;
      if (l.mode === 'static') return l.channels.map((c) => ({ label: c.label, number: null, callSign: null, ref: c.ref }));
      if (l.mode === 'response') {
        // Read the guide data the page downloads itself (passively: nothing is changed or replayed).
        const re = compileRegex(l.responseUrl);
        const bodies: Promise<unknown>[] = [];
        const onResponse = (r: { url(): string; status(): number; json(): Promise<unknown> }) => {
          if (re.test(r.url()) && r.status() === 200) bodies.push(r.json().catch(() => null));
        };
        page.on('response', onResponse);
        try {
          const first = page.waitForResponse((r) => re.test(r.url()), { timeout: l.timeoutMs }).catch(() => null);
          await tools.load(page, l.guideUrl, t.pageTimeoutMs);
          await first;
          if (l.scrollContainer && l.maxScrolls > 0) await page.evaluate(`(${SCROLL_ALL})(${JSON.stringify(l)})`).catch(() => {});
          await page.waitForTimeout(l.settleMs);
        } finally {
          page.off('response', onResponse);
        }
        const seen = new Set<string>();
        const out: DiscoveredChannel[] = [];
        for (const body of await Promise.all(bodies)) {
          for (const item of itemsFromJson(body, { items: l.items, ref: l.ref, label: l.label, number: l.number, refPattern: l.refPattern, require: l.require })) {
            if (seen.has(item.ref!)) continue;
            seen.add(item.ref!);
            out.push(item);
          }
        }
        return out;
      }
      await openGuide(page, tools);
      const rows = (await page.evaluate(`(${READ_ROWS})(${JSON.stringify(l)})`)) as { label: string; number: string | null; ref: string | null }[];
      const seen = new Set<string>();
      const out: DiscoveredChannel[] = [];
      for (const r of rows) {
        const ref = refFromText(r.ref, l.ref.pattern);
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);
        const n = Number(r.number);
        out.push({ label: refFromText(r.label, l.label.pattern) ?? r.label, number: Number.isFinite(n) && n > 0 ? n : null, callSign: null, ref });
      }
      return out;
    },
  };
}

/** Runs in the page: scroll an element to the bottom, one screenful at a time (lazy guides load as you go). */
const SCROLL_ALL = `async (l) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = document.querySelector(l.scrollContainer) || document.scrollingElement;
  for (let i = 0; i < l.maxScrolls; i++) {
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) break;
    box.scrollTop += Math.max(100, box.clientHeight);
    await sleep(l.settleMs);
  }
}`;

const MARK = 'data-tappedin-tune';

/** Runs in the page: scroll until the row whose id is `ref` shows, mark its click target. True when found. */
export const MARK_ROW = `async ({ l, target, ref }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (row, spec) => {
    const el = spec.selector ? row.querySelector(spec.selector) : row;
    return el ? el.getAttribute(spec.attr) : null;
  };
  const idOf = (text) => {
    if (!text || !l.ref.pattern) return text;
    const re = /^\\/(.*)\\/([dgimsuvy]*)$/s.exec(l.ref.pattern);
    const m = (re ? new RegExp(re[1], re[2]) : new RegExp(l.ref.pattern)).exec(text);
    return m ? m[1] : null;
  };
  for (const old of document.querySelectorAll('[${MARK}]')) old.removeAttribute('${MARK}');
  const box = l.scrollContainer ? document.querySelector(l.scrollContainer) : document.scrollingElement;
  for (let i = 0; i <= l.maxScrolls; i++) {
    for (const row of document.querySelectorAll(l.row)) {
      if (idOf(pick(row, l.ref)) !== ref) continue;
      const base = target.closest ? row.closest(target.closest) : row;
      const el = base && (target.selector ? base.querySelector(target.selector) : base);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.setAttribute('${MARK}', '1');
      return true;
    }
    if (!box || box.scrollTop + box.clientHeight >= box.scrollHeight - 2) break;
    box.scrollTop += Math.max(200, Math.floor(box.clientHeight * 0.8));
    await sleep(l.settleMs);
  }
  return false;
}`;

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
