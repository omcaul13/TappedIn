import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config';
import { STATE_DIR } from '../providers/registry';

// Whether this install has been through the first-run setup (pick a service, sign in, check the
// channels, test streams), and what it found. Kept in .state/setup.json.

export const SetupStateSchema = z.object({
  version: z.literal(1).default(1),
  /** The service setup was done for. */
  provider: z.string().nullable().default(null),
  completed: z.boolean().default(false),
  /** Screens in the grid (from the stream test, or the user's choice up to it). */
  screens: z.number().int().min(1).max(4).default(4),
  /** Streams that played at once in the last stream test. */
  measuredStreams: z.number().int().min(0).nullable().default(null),
  testedAt: z.string().nullable().default(null),
  lineupAt: z.string().nullable().default(null),
});
export type SetupState = z.infer<typeof SetupStateSchema>;

const file = (stateDir: string) => path.join(stateDir, 'setup.json');

export function loadSetup(stateDir = STATE_DIR): SetupState {
  try {
    return SetupStateSchema.parse(JSON.parse(readFileSync(file(stateDir), 'utf8')));
  } catch {
    return SetupStateSchema.parse({});
  }
}

export function saveSetup(s: SetupState, stateDir = STATE_DIR): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(file(stateDir), JSON.stringify(SetupStateSchema.parse(s), null, 2));
}

/** First-run setup is needed until it's completed for the service the config asks for. */
export function needsSetup(s: SetupState, cfg: Config): boolean {
  return !s.completed || s.provider !== cfg.provider;
}

/**
 * Installs from before setup existed (Xfinity On Campus, with its remembered channel URLs) count as
 * set up: same service, four screens, the config file's lineup. Returns the new state, or null when
 * there was nothing to migrate.
 */
export function migrateOwner(stateDir: string, cfg: Config): SetupState | null {
  if (existsSync(file(stateDir))) return null;
  if (cfg.provider !== 'xfinity-on-campus' || !existsSync(path.join(stateDir, 'xfinity-urls.json'))) return null;
  const s = SetupStateSchema.parse({ provider: 'xfinity-on-campus', completed: true, screens: 4 });
  saveSetup(s, stateDir);
  return s;
}
