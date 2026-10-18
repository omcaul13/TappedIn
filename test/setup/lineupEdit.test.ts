import { describe, expect, it } from 'vitest';
import { resolveChannel } from '../../src/channels';
import { parseConfig } from '../../src/config';
import type { DiscoveredChannel } from '../../src/providers/types';
import { applyMapping, lineupFromScan, mappingRows } from '../../src/setup/lineupEdit';

const rows: DiscoveredChannel[] = [
  { label: 'ESPN HD', number: 849, callSign: 'ESPND', ref: null },
  { label: 'Big Ten Network', number: 977, callSign: 'BTNHD', ref: null },
  { label: 'Sportsnet', number: null, callSign: null, ref: 'abc123' },
];

describe('channel mapping', () => {
  it('lineupFromScan lists found and missing networks', () => {
    const r = lineupFromScan(rows);
    expect(r.found).toEqual(['ESPN', 'Big Ten Network']);
    expect(r.missing).toContain('FS1');
    expect(r.lineup.ESPN.number).toBe(849);
  });

  it('an empty scan finds nothing (callers must not save it over a good lineup)', () => {
    expect(lineupFromScan([{ label: 'Home Shopping', number: 5, callSign: null, ref: null }]).found).toEqual([]);
    expect(lineupFromScan([]).found).toEqual([]);
  });

  it('mapping a network to a scanned row copies number, call sign and service id', () => {
    const { lineup } = lineupFromScan(rows);
    const fs1 = applyMapping(lineup, rows, 'FS1', 0);
    expect(fs1.FS1).toEqual({ number: 849, callSign: 'ESPND', aliases: ['FS1'] });
    const sn = applyMapping(lineup, rows, 'ESPNU', 2);
    expect(sn.ESPNU.ref).toBe('abc123');
    expect(sn.ESPNU.number).toBe(977 + 2 + 1); // same synthetic numbering as a scan
    expect(lineup.FS1.number).toBeNull(); // the input isn't changed
  });

  it('null marks a network as not in my lineup, and its games become unavailable', () => {
    const { lineup } = lineupFromScan(rows);
    const edited = applyMapping(lineup, rows, 'Big Ten Network', null);
    expect(edited['Big Ten Network']).toEqual({ number: null, aliases: ['Big Ten Network', 'BTN'] });
    const cfg = parseConfig({ channels: edited, unavailable: [] });
    expect(resolveChannel(cfg, ['BTN']).available).toBe(false);
    expect(resolveChannel(cfg, ['ESPN']).available).toBe(true);
  });

  it('rejects an unknown network or row', () => {
    const { lineup } = lineupFromScan(rows);
    expect(() => applyMapping(lineup, rows, 'Nope', 0)).toThrow(/unknown network/);
    expect(() => applyMapping(lineup, rows, 'FS1', 9)).toThrow(/no guide row/);
  });

  it('mappingRows lists each network with its current channel', () => {
    const { lineup } = lineupFromScan(rows);
    const m = mappingRows(lineup, rows);
    expect(m.find((r) => r.key === 'ESPN')).toEqual({ key: 'ESPN', row: 0, label: 'ESPN HD', number: 849 });
    expect(m.find((r) => r.key === 'FS1')).toEqual({ key: 'FS1', row: null, label: null, number: null });
  });
});
