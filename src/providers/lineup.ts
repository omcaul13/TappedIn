import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ChannelSchema, type Config } from '../config';
import type { ChannelRef } from './types';

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

/** The lineup entry for an engine channel number, as a screen tunes to it. */
export function channelRef(channels: Config['channels'], number: number): ChannelRef | null {
  for (const [name, e] of Object.entries(channels)) {
    if (e.number === number) return { name, number, callSign: e.callSign ?? null, ref: e.ref ?? null };
  }
  return null;
}
