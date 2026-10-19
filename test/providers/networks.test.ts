import { describe, expect, it } from 'vitest';
import { CFB_NETWORKS, matchLineup, NETWORKS, normalizeGuideName } from '../../src/providers/networks';
import type { DiscoveredChannel } from '../../src/providers/types';

const row = (label: string, number: number | null = null, extra: Partial<DiscoveredChannel> = {}): DiscoveredChannel => ({ label, number, callSign: null, ref: null, ...extra });

describe('network matching', () => {
  it('normalizes decorations away', () => {
    expect(normalizeGuideName('Big Ten Network HD')).toBe('big ten');
    expect(normalizeGuideName('ESPN2 (HD)')).toBe('espn2');
    expect(normalizeGuideName('The CW')).toBe('cw');
  });

  it('has an entry for every channel key in the shipped config, with ESPN aliases', () => {
    const keys = CFB_NETWORKS.map((n) => n.key);
    for (const k of ['ESPN', 'ESPN2', 'ESPNU', 'ABC', 'CBS', 'NBC', 'FOX', 'FS1', 'FS2', 'SEC Network', 'ACC Network', 'Big Ten Network', 'CBS Sports Network', 'The CW', 'TNT', 'truTV', 'USA Network']) expect(keys).toContain(k);
    expect(CFB_NETWORKS.find((n) => n.key === 'SEC Network')?.espnNames).toEqual(['SEC Network', 'SECN']);
  });

  it('matches decorated guide names', () => {
    const m = matchLineup([row('ESPN2 HD', 10), row('FOX Sports 1', 11), row('Big Ten Network HD', 12), row('SEC Network', 13)]);
    expect(m.ESPN2.number).toBe(10);
    expect(m.FS1.number).toBe(11);
    expect(m['Big Ten Network'].number).toBe(12);
    expect(m['SEC Network'].number).toBe(13);
    expect(m['SEC Network'].aliases).toEqual(['SEC Network', 'SECN']);
  });

  it('keeps guide numbers and call signs', () => {
    const m = matchLineup([row('ESPN', 849, { callSign: 'ESPND' })]);
    expect(m.ESPN).toEqual({ number: 849, callSign: 'ESPND', aliases: ['ESPN'] });
  });

  it('missing networks are null', () => {
    const m = matchLineup([row('ESPN', 849)]);
    expect(m['ACC Network'].number).toBeNull();
    expect(Object.keys(m).length).toBe(NETWORKS.length);
  });

  it('does not mistake news or business channels for the broadcast network', () => {
    const m = matchLineup([row('FOX News Channel', 1), row('Fox Business', 2), row('CBS Sports Network', 3), row('ESPN Deportes', 4)]);
    expect(m.FOX.number).toBeNull();
    expect(m.CBS.number).toBeNull();
    expect(m['CBS Sports Network'].number).toBe(3);
    expect(m.ESPN.number).toBeNull();
  });

  it('prefers the HD row when a network appears twice', () => {
    const m = matchLineup([row('ESPN', 30), row('ESPN HD', 849)]);
    expect(m.ESPN.number).toBe(849);
  });

  it('synthetic numbers are stable in guide order for services without channel numbers', () => {
    const found = [row('ESPN', null, { ref: 'a' }), row('FS1', null, { ref: 'b' })];
    const a = matchLineup(found);
    const b = matchLineup(found);
    expect(a.ESPN).toEqual({ number: 1, ref: 'a', aliases: ['ESPN'] });
    expect(a.FS1.number).toBe(2);
    expect(b).toEqual(a);
  });

  it('maps locals by affiliate call sign', () => {
    const m = matchLineup([row('WCVB', 805, { callSign: 'WCVBD' }), row('WBZ', 804)], { ABC: 'WCVB', CBS: 'WBZ' });
    expect(m.ABC.number).toBe(805);
    expect(m.CBS.number).toBe(804);
  });

  it('real Xfinity channel map (Northeastern, 10/18): call signs tell ESPN, ESPN2 and ESPNews apart', () => {
    // Comcast labels every ESPN channel with its parent network, "ESPN"; only the call signs differ.
    // Rows as the channel map listed them, mirrored ranges (1205, 11205) and an ESWHD feed included.
    const rows: DiscoveredChannel[] = [
      { label: 'ESPN', number: 49, callSign: 'ESPN', ref: null },
      { label: 'ESPN', number: 50, callSign: 'ESPN2', ref: null },
      { label: 'ESPN', number: 248, callSign: 'ESPNN', ref: null },
      { label: 'ESPNU', number: 263, callSign: 'ESPNU', ref: null },
      { label: 'ESPN HD', number: 796, callSign: 'ESWHD', ref: null },
      { label: 'ESPN HD', number: 849, callSign: 'ESPND', ref: null },
      { label: 'ESPN HD', number: 850, callSign: 'ES2HD', ref: null },
      { label: 'ESPNU HD', number: 900, callSign: 'ESPNU', ref: null },
      { label: 'ESPN HD', number: 1205, callSign: 'ESPND', ref: null },
      { label: 'ESPN HD', number: 1206, callSign: 'ES2HD', ref: null },
      { label: 'ESPN HD', number: 1210, callSign: 'ESWHD', ref: null },
      { label: 'ESPNU HD', number: 1301, callSign: 'ESPNU', ref: null },
      { label: 'ESPN HD', number: 11205, callSign: 'ESPND', ref: null },
      { label: 'ESPN HD', number: 11206, callSign: 'ES2HD', ref: null },
    ];
    const m = matchLineup(rows);
    // The same channels as the hand-made Northeastern config.
    expect(m.ESPN).toMatchObject({ number: 849, callSign: 'ESPND' });
    expect(m.ESPN2).toMatchObject({ number: 850, callSign: 'ES2HD' });
    expect(m.ESPNU).toMatchObject({ number: 900, callSign: 'ESPNU' });
    expect(m.ESPNews).toMatchObject({ number: 248, callSign: 'ESPNN' });
  });

  it('matches a local whose label names the network', () => {
    const m = matchLineup([row('ABC 5 Boston (WCVB)', 805)]);
    expect(m.ABC.number).toBe(805);
  });
});
