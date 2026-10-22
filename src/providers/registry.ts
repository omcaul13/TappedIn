import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_ROOT, PROJECT_ROOT, writeJsonAtomic } from '../config';
import { createComcastAdapter } from './comcast/adapter';
import { ComcastTuningSchema } from './comcast/tvapp';
import { createUrlAdapter, UrlTuningSchema } from './url/adapter';
import { compileRegex, ProviderConfigSchema, type ProviderAdapter, type ProviderConfig, type ProviderSummary } from './types';

export { compileRegex };

export const PROVIDERS_DIR = path.join(PROJECT_ROOT, 'config', 'providers');
export const STATE_DIR = path.join(DATA_ROOT, '.state');
const TUNING_SCHEMAS = { comcast: ComcastTuningSchema, url: UrlTuningSchema } as const;

export interface LoadOptions {
  /** Where user overrides live (<stateDir>/providers/<id>.json). */
  stateDir?: string;
  /** A user override that can't be used, with the reason. */
  onWarning?: (msg: string) => void;
}

/** Every provider shipped in config/providers, in file-name order. */
export function providerIds(): string[] {
  return readdirSync(PROVIDERS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function listProviders(opts: LoadOptions = {}): ProviderSummary[] {
  return providerIds().map((id) => {
    const c = loadProviderConfig(id, opts);
    return { id: c.id, name: c.name, shortName: c.shortName, kind: c.kind, status: c.status, badge: c.badge, search: c.search, documentedMaxStreams: c.documentedMaxStreams };
  });
}

/**
 * The shipped config for a provider with the user's override deep-merged on top. The override is
 * applied one top-level section at a time: a section that doesn't validate (bad type, broken regex)
 * is dropped with a warning and the shipped section is kept, so a typo never stops the app.
 */
export function loadProviderConfig(id: string, opts: LoadOptions = {}): ProviderConfig {
  const shipped = shippedConfig(id);
  const override = readOverride(id, opts);
  return override ? mergeOverride(shipped, override, (key, why) => opts.onWarning?.(`.state/providers/${id}.json: ignoring "${key}": ${why}`)) : shipped;
}

function shippedConfig(id: string): ProviderConfig {
  const file = path.join(PROVIDERS_DIR, `${id}.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`unknown provider "${id}" (no ${path.relative(PROJECT_ROOT, file)})`);
    throw new Error(`config/providers/${id}.json: ${String(err)}`);
  }
  const shipped = ProviderConfigSchema.safeParse(raw);
  if (!shipped.success) throw new Error(`config/providers/${id}.json is invalid:\n${z.prettifyError(shipped.error)}`);
  return shipped.data;
}

/** Apply an override one top-level section at a time; a section that doesn't validate is skipped and reported. */
function mergeOverride(shipped: ProviderConfig, override: Record<string, unknown>, skipped: (key: string, why: string) => void): ProviderConfig {
  let merged = shipped as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (key === 'id') continue;
    const candidate = { ...merged, [key]: key in merged ? deepMerge(merged[key], value) : value };
    const r = ProviderConfigSchema.safeParse(candidate);
    // The family's own tuning schema too: the adapter throws on a bad section, which would stop the app.
    const tuning = r.success && r.data.family === shipped.family ? TUNING_SCHEMAS[shipped.family].safeParse(r.data.tuning) : null;
    if (r.success && tuning?.success) merged = r.data as Record<string, unknown>;
    else if (!r.success) skipped(key, z.prettifyError(r.error).split('\n').slice(0, 3).join(' '));
    else if (!tuning) skipped(key, "the family can't be changed by an override");
    else if (!tuning.success) skipped(key, z.prettifyError(tuning.error).split('\n').slice(0, 3).join(' '));
  }
  return merged as ProviderConfig;
}

/** What an override would do, without reading or writing any file (diagnostics' "Save & retry" checks this first). */
export function previewOverride(id: string, override: Record<string, unknown>): { config: ProviderConfig; warnings: string[] } {
  const warnings: string[] = [];
  const config = mergeOverride(shippedConfig(id), override, (key, why) => warnings.push(`"${key}": ${why}`));
  try {
    adapterFor(config);
  } catch (err) {
    warnings.push(String(err instanceof Error ? err.message : err).split('\n').slice(0, 3).join(' '));
  }
  return { config, warnings };
}

/** Save a user override for a provider. Refuses (throws) if any part of it wouldn't be used. */
export function saveOverride(id: string, override: Record<string, unknown>, stateDir = STATE_DIR): string {
  const { warnings } = previewOverride(id, override);
  if (warnings.length) throw new Error(`not saved: ${warnings.join('; ')}`);
  const file = path.join(stateDir, 'providers', `${id}.json`);
  writeJsonAtomic(file, override);
  return file;
}

/** The user's override for a provider as saved (empty when there is none). */
export function readOverrideFile(id: string, stateDir = STATE_DIR): Record<string, unknown> {
  return readOverride(id, { stateDir }) ?? {};
}

function readOverride(id: string, opts: LoadOptions): Record<string, unknown> | null {
  const file = path.join(opts.stateDir ?? STATE_DIR, 'providers', `${id}.json`);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    opts.onWarning?.(`.state/providers/${id}.json: expected a JSON object; ignoring it`);
  } catch (err) {
    opts.onWarning?.(`.state/providers/${id}.json: not valid JSON (${String(err).split('\n')[0]}); ignoring it`);
  }
  return null;
}

/** The adapter for a provider, built from its (merged) config. */
export function createAdapter(id: string, opts: LoadOptions = {}): ProviderAdapter {
  return adapterFor(loadProviderConfig(id, opts));
}

export function adapterFor(config: ProviderConfig): ProviderAdapter {
  if (config.status === 'unsupported') throw new Error(`${config.name} isn't supported: ${config.notes}`);
  switch (config.family) {
    case 'comcast':
      return createComcastAdapter(config);
    case 'url':
      return createUrlAdapter(config);
  }
}

/** Objects merge key by key; anything else (arrays, strings, numbers) replaces. */
export function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
