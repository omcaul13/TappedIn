import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { channelRef, effectiveChannels } from '../../src/providers/lineup';
import { testConfig } from '../helpers';

const emptyDir = () => mkdtempSync(path.join(tmpdir(), 'rz-lineup-'));

describe('lineup', () => {
  it('effectiveChannels returns config channels when there is no lineup file', () => {
    const cfg = testConfig();
    expect(effectiveChannels(cfg, 'xfinity-on-campus', emptyDir())).toEqual(cfg.channels);
  });

  it('effectiveChannels prefers the .state lineup file', () => {
    const cfg = testConfig();
    const dir = emptyDir();
    mkdirSync(path.join(dir, 'lineups'), { recursive: true });
    const scanned = { ESPN: { number: 3, callSign: null, ref: '12345', aliases: ['ESPN'] } };
    writeFileSync(path.join(dir, 'lineups', 'spectrum-tv.json'), JSON.stringify(scanned));
    expect(effectiveChannels(cfg, 'spectrum-tv', dir)).toEqual({ ESPN: { number: 3, ref: '12345', aliases: ['ESPN'] } });
    expect(effectiveChannels(cfg, 'xfinity-on-campus', dir)).toEqual(cfg.channels);
  });

  it('a broken lineup file falls back to the config channels', () => {
    const cfg = testConfig();
    const dir = emptyDir();
    mkdirSync(path.join(dir, 'lineups'), { recursive: true });
    writeFileSync(path.join(dir, 'lineups', 'sling.json'), '{ broken');
    expect(effectiveChannels(cfg, 'sling', dir)).toEqual(cfg.channels);
  });

  it('channelRef finds name, call sign and ref by number', () => {
    const channels = { ESPN: { number: 849, callSign: 'ESPND', aliases: ['ESPN'] }, Spec: { number: 3, ref: '12345', aliases: [] } };
    expect(channelRef(channels, 849)).toEqual({ name: 'ESPN', number: 849, callSign: 'ESPND', ref: null });
    expect(channelRef(channels, 3)).toEqual({ name: 'Spec', number: 3, callSign: null, ref: '12345' });
    expect(channelRef(channels, 7)).toBeNull();
  });
});
