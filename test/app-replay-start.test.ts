import { describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { replayRecords } from '../src/espn/source';
import { FIXTURES, testConfig } from './helpers';

// `--replay <day> --from 15:30` on a recording that starts at 18:31 must not sit on "No games today"
// for hours of replay time: the replay starts at the first record.
// The App is made without its constructor so nothing touches .state, logs or the network.

describe('replay --from before the recording starts', () => {
  it('starts the clock at the first record', async () => {
    const dir = `${FIXTURES}/replay-20261017`;
    let first = 0;
    for await (const r of replayRecords({ dir })) {
      first = r.at;
      break;
    }
    const fromMs = first - 3 * 3600_000;
    const starts: number[] = [];
    const infos: string[] = [];
    const app: any = Object.create(App.prototype);
    Object.assign(app, {
      cfg: testConfig(),
      stopped: false,
      clock: { start: (t: number) => starts.push(t), now: () => Number.MAX_SAFE_INTEGER },
      ingest: { ingestScoreboard: () => [], ingestSummary: () => {}, ingestSnapshots: () => {}, ingestPlays: () => {} },
      engine: { tick: () => ({}) },
      info: (t: string) => {
        infos.push(t);
        app.stopped = true; // enough: the replay window has started
      },
      startTicking: () => {},
    });
    // recordingDir(PROJECT_ROOT, date) is PROJECT_ROOT/recordings/<date>: point it at the test fixture.
    await app.runReplay({ date: '../test/fixtures/replay-20261017', fromMs, speed: 1e9, synth: false });
    expect(starts.at(-1)).toBeGreaterThanOrEqual(first);
    expect(starts.at(-1)! - first).toBeLessThan(60_000);
    expect(infos[0]).toMatch(/^replaying /);
  });
});
