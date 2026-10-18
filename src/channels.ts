import type { Config } from './config';

// Network names from ESPN → a channel in the user's Xfinity lineup.

export type Availability =
  | { available: true; channel: string; number: number }
  | { available: false; reason: string };

/** Resolve a game's ESPN network names to a playable channel from the config. */
export function resolveChannel(cfg: Pick<Config, 'channels' | 'unavailable'>, networks: string[]): Availability {
  const notInLineup: string[] = [];
  for (const net of networks) {
    const name = net.trim().toLowerCase();
    for (const [channel, entry] of Object.entries(cfg.channels)) {
      if (!entry.aliases.some((a) => a.toLowerCase() === name) && channel.toLowerCase() !== name) continue;
      if (entry.number !== null) return { available: true, channel, number: entry.number };
      notInLineup.push(channel);
    }
  }
  if (notInLineup.length) return { available: false, reason: `not in lineup: ${notInLineup.join(', ')}` };
  const streaming = networks.filter((n) => cfg.unavailable.some((u) => u.toLowerCase() === n.trim().toLowerCase()));
  if (streaming.length) return { available: false, reason: `streaming only: ${streaming.join(', ')}` };
  return { available: false, reason: networks.length ? `unknown network: ${networks.join(', ')}` : 'no network listed' };
}
