import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/config';
import { listProviders } from '../../src/providers/registry';
import type { ChannelRef, DiscoveredChannel } from '../../src/providers/types';
import { SetupRunner, type SetupDeps, type SetupScreen } from '../../src/setup/runner';
import type { StreamState } from '../../src/windows/health';

type Outcome = StreamState;

/** Fake screens: each tune "plays" or fails according to `outcomes` (one per screen, in order). */
function fakeScreens(outcomes: Outcome[], log: { screen: number; ch: string }[]): SetupScreen[] {
  return outcomes.map((o, i) => ({
    tune: vi.fn(async (ch: ChannelRef) => void log.push({ screen: i + 1, ch: ch.name })),
    health: vi.fn(async () => ({ state: o, detail: o === 'PLAYING' ? '+2.0s' : o === 'STREAM_LIMIT' ? 'You have reached the maximum number of devices' : 'no <video>' })),
    release: vi.fn(async () => {}),
  }));
}

const rows: DiscoveredChannel[] = [
  { label: 'ESPN HD', number: 849, callSign: 'ESPND', ref: null },
  { label: 'ESPN2 HD', number: 850, callSign: 'ES2HD', ref: null },
  { label: 'FS1 HD', number: 925, callSign: 'FS1HD', ref: null },
  { label: 'ABC HD', number: 805, callSign: 'WCVBD', ref: null },
  { label: 'CBS HD', number: 804, callSign: 'WBZHD', ref: null },
];

function setup(opts: { outcomes?: Outcome[]; found?: DiscoveredChannel[] } = {}) {
  const tuned: { screen: number; ch: string }[] = [];
  let channels: Config['channels'] = {};
  const saved: Record<string, unknown>[] = [];
  const deps: SetupDeps = {
    providers: () => listProviders(),
    useProvider: vi.fn(async () => {}),
    retrySignin: vi.fn(),
    discover: vi.fn(async () => opts.found ?? rows),
    screens: () => fakeScreens(opts.outcomes ?? ['PLAYING', 'PLAYING', 'PLAYING', 'PLAYING'], tuned),
    channels: () => channels,
    saveLineup: vi.fn((lineup) => {
      channels = lineup;
    }),
    saveSetup: vi.fn((patch) => void saved.push(patch)),
    finished: vi.fn(async () => {}),
    startupTimeoutMs: 3000,
    sleep: async () => {},
    onChange: () => {},
  };
  return { runner: new SetupRunner(deps), deps, tuned, saved };
}

describe('first-run setup', () => {
  it('starts at welcome; choosing a service switches to it and waits for sign-in', async () => {
    const { runner, deps } = setup();
    expect(runner.view().step).toBe('welcome');
    await runner.choose('spectrum-tv');
    expect(deps.useProvider).toHaveBeenCalledWith('spectrum-tv');
    expect(runner.view()).toMatchObject({ step: 'signin', provider: { id: 'spectrum-tv' } });
  });

  it('signin failure returns to the sign-in step with the reason', async () => {
    const { runner } = setup();
    await runner.choose('spectrum-tv');
    await runner.onSignin({ state: 'failed', detail: 'the sign-in window was closed' });
    expect(runner.view()).toMatchObject({ step: 'signin', error: 'the sign-in window was closed' });
  });

  it('sign-in success scans the channels, tests playback and counts streams on its own', async () => {
    const { runner, tuned } = setup();
    await runner.choose('xfinity-on-campus');
    await runner.onSignin({ state: 'ok', detail: '' });
    const v = runner.view();
    expect(v.step).toBe('streams');
    expect(v.scan?.found).toEqual(expect.arrayContaining(['ESPN', 'ESPN2', 'FS1', 'ABC', 'CBS']));
    expect(v.scan?.missing).toContain('Big Ten Network');
    expect(v.playback).toMatchObject({ channel: 'ESPN', state: 'PLAYING' });
    expect(v.streams?.measured).toBe(4);
    expect(tuned[0]).toEqual({ screen: 1, ch: 'ESPN' });
  });

  it("a failed playback test stops before the stream test, so its error stays on screen", async () => {
    const { runner, tuned } = setup({ outcomes: ['STALLED', 'PLAYING', 'PLAYING', 'PLAYING'] });
    await runner.choose('xfinity-on-campus');
    await runner.onSignin({ state: 'ok', detail: '' });
    expect(runner.view().step).toBe('playback');
    expect(runner.view().error).toMatch(/didn't play/);
    expect(tuned).toHaveLength(1);
  });

  it('scan saves the lineup only when it found sports networks', async () => {
    const { runner, deps } = setup({ found: [{ label: 'Home Shopping', number: 5, callSign: null, ref: null }] });
    await runner.choose('xfinity-on-campus');
    await runner.scan();
    expect(deps.saveLineup).not.toHaveBeenCalled();
    expect(runner.view().error).toMatch(/no sports channels/i);
  });

  it('playTest picks the first carried network in priority order', async () => {
    const { runner, tuned } = setup({ found: [rows[3], rows[2]] }); // ABC, FS1 only
    await runner.choose('xfinity-on-campus');
    await runner.scan();
    await runner.playTest();
    expect(tuned[0].ch).toBe('FS1');
  });

  it('stream test stops at the first stream limit and names the documented limit', async () => {
    const { runner, tuned } = setup({ outcomes: ['PLAYING', 'PLAYING', 'STREAM_LIMIT', 'PLAYING'] });
    await runner.choose('xfinity-on-campus');
    await runner.scan();
    await runner.playTest();
    await runner.streamTest();
    const s = runner.view().streams!;
    expect(s.measured).toBe(2);
    expect(s.message).toMatch(/2 streams at once/);
    expect(s.message).toMatch(/Xfinity documents 1/);
    expect(s.message).toMatch(/2 screens/);
    expect(tuned.map((t) => t.screen)).toEqual([1, 2, 3]);
  });

  it('stream test tunes a different channel on each screen', async () => {
    const { runner, tuned } = setup();
    await runner.choose('xfinity-on-campus');
    await runner.scan();
    await runner.playTest();
    await runner.streamTest();
    expect(runner.view().streams?.measured).toBe(4);
    expect(new Set(tuned.map((t) => t.ch)).size).toBe(4);
  });

  it('zero playable streams reports the reason and keeps 1 screen', async () => {
    const { runner, saved } = setup({ outcomes: ['STALLED', 'STALLED', 'STALLED', 'STALLED'] });
    await runner.choose('sling');
    await runner.scan();
    await runner.playTest();
    await runner.streamTest();
    const s = runner.view().streams!;
    expect(s.measured).toBe(0);
    expect(s.message).toMatch(/no video played/i);
    await runner.finish(4);
    expect(saved.at(-1)).toMatchObject({ completed: true, screens: 1, measuredStreams: 0 });
  });

  it('finish clamps the screens to what played, saves the setup and hands over', async () => {
    const { runner, deps, saved } = setup({ outcomes: ['PLAYING', 'PLAYING', 'PLAYING', 'STREAM_LIMIT'] });
    await runner.choose('xfinity-on-campus');
    await runner.scan();
    await runner.playTest();
    await runner.streamTest();
    await runner.finish(4);
    expect(saved.at(-1)).toMatchObject({ provider: 'xfinity-on-campus', completed: true, screens: 3, measuredStreams: 3 });
    expect(deps.finished).toHaveBeenCalledWith(3);
    expect(runner.view().step).toBe('done');
  });
});
