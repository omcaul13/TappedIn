import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { testConfig } from './helpers';

// Diagnostics and setup pause the app (stopNormal) and start it again (startNormal). In a replay
// that must resume the replay's ticks, not start a second replay from the beginning.
// The App is made without its constructor so nothing touches .state, logs or the network.

let app: any;
afterEach(() => {
  for (const t of app?.timers ?? []) clearInterval(t);
});

describe('replay across a pause (diagnostics, setup)', () => {
  it('starting the app again resumes the running replay instead of restarting it', async () => {
    app = Object.create(App.prototype);
    Object.assign(app, { opts: { replay: { date: '20261017', fromMs: 0, speed: 10, synth: false } }, cfg: testConfig(), timers: [], source: null, stopped: false, replay: 'idle' }); // the class fields the constructor would set
    let runs = 0;
    let release: () => void = () => {};
    app.runReplay = function (this: any) {
      runs++;
      // Like the real loop: once the replay window starts, it starts the ticks itself.
      return new Promise<void>((res) => (release = res)).then(() => {
        this.replay = 'playing';
        this.startTicking();
      });
    };
    let ticking = 0;
    const startTicking = app.startTicking;
    app.startTicking = function (this: any) {
      ticking++;
      startTicking.call(this);
    };

    app.startNormal();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect([runs, ticking]).toEqual([1, 1]);

    app.stopNormal(); // diagnostics opened
    expect(app.timers).toEqual([]);
    app.startNormal(); // diagnostics closed
    expect(runs).toBe(1);
    expect(ticking).toBe(2);
  });
});
