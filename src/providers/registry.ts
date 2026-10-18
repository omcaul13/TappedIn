import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PROJECT_ROOT } from '../config';
import { compileRegex, ProviderConfigSchema, type ProviderConfig, type ProviderSummary } from './types';

export { compileRegex };

export const PROVIDERS_DIR = path.join(PROJECT_ROOT, 'config', 'providers');
export const STATE_DIR = path.join(PROJECT_ROOT, '.state');

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

  const override = readOverride(id, opts);
  if (!override) return shipped.data;

  let merged = shipped.data as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (key === 'id') continue;
    const candidate = { ...merged, [key]: key in merged ? deepMerge(merged[key], value) : value };
    const r = ProviderConfigSchema.safeParse(candidate);
    if (r.success) merged = r.data as Record<string, unknown>;
    else opts.onWarning?.(`.state/providers/${id}.json: ignoring "${key}": ${z.prettifyError(r.error).split('\n').slice(0, 3).join(' ')}`);
  }
  return merged as ProviderConfig;
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
