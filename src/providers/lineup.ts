import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ChannelSchema, type Config } from '../config';
import { matchLineup } from './networks';
import type { ChannelRef, DiscoveredChannel } from './types';

// The channels a user's service carries. A lineup scan (or the settings page) saves them to
// .state/lineups/<provider>.json; without that file the `channels` in the config file are used,
// which is exactly what Xfinity On Campus has always done.

const LineupFileSchema = z.record(
  z.string(),
  ChannelSchema.extend({ callSign: z.string().nullish(), ref: z.string().nullish() }).transform(({ callSign, ref, ...rest }) => ({
    ...rest,
    ...(callSign ? { callSign } : {}),
    ...(ref ? { ref } : {}),
  })),
);

export function lineupFile(providerId: string, stateDir: string): string {
  return path.join(stateDir, 'lineups', `${providerId}.json`);
}

export function effectiveChannels(cfg: Config, providerId: string, stateDir: string): Config['channels'] {
  let text: string;
  try {
    text = readFileSync(lineupFile(providerId, stateDir), 'utf8');
  } catch {
    return cfg.channels;
  }
  try {
    return LineupFileSchema.parse(JSON.parse(text));
  } catch {
    return cfg.channels;
  }
}

export function scanFile(providerId: string, stateDir: string): string {
  return lineupFile(providerId, stateDir).replace(/\.json$/, '.scan.json');
}

/**
 * Networks added since the lineup was saved (other sports' networks, new regional ones): match them
 * in the saved guide scan and add them. Existing entries, including your own mapping, never change.
 * Returns the networks added that the guide carries.
 */
export function upgradeLineup(providerId: string, stateDir: string): string[] {
  let lineup: Config['channels'];
  let rows: DiscoveredChannel[];
  try {
    lineup = LineupFileSchema.parse(JSON.parse(readFileSync(lineupFile(providerId, stateDir), 'utf8')));
    rows = JSON.parse(readFileSync(scanFile(providerId, stateDir), 'utf8')) as DiscoveredChannel[];
  } catch {
    return [];
  }
  const matched = matchLineup(rows);
  const added = Object.keys(matched).filter((k) => !(k in lineup));
  if (!added.length) return [];
  for (const k of added) lineup[k] = matched[k];
  writeFileSync(lineupFile(providerId, stateDir), JSON.stringify(lineup, null, 2));
  return added.filter((k) => matched[k].number !== null);
}

/** The lineup entry for an engine channel number, as a screen tunes to it. */
export function channelRef(channels: Config['channels'], number: number): ChannelRef | null {
  for (const [name, e] of Object.entries(channels)) {
    if (e.number === number) return { name, number, callSign: e.callSign ?? null, ref: e.ref ?? null };
  }
  return null;
}
