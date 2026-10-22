// TappedIn.
//   npm start                                   live: one TappedIn window, ESPN + Xfinity video in a 2x2 grid
//   npm run start:chrome                        the original four Chrome tile windows + control panel
//   npm start -- --dry-run                      live ESPN data, data tiles instead of video (uses no streams)
//   npm start -- --replay 20261017 --from 19:30 --speed 10     a recorded night, sped up (data tiles)
//   npm start -- --replay 20261010 --synth --from 15:30 --speed 20
//   options: --homes id,id,id,id   --no-auto (start with no home games; pick them per screen)
//            --audio auto|manual   --no-record   --chrome
// Old control panel (both shells): http://localhost:7480/panel
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../src/cli';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { App } from '../src/app';
import { etTime } from '../src/sim';

// Secrets (YT_API_KEY for YouTube highlights) live in .env, never in the config file.
const envFile = path.join(PROJECT_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The app was called RedZone: move its data folder (service sign-ins, Chrome profile) once, so nobody is signed out.
const localData = process.env.LOCALAPPDATA;
if (localData && existsSync(path.join(localData, 'RedZone')) && !existsSync(path.join(localData, 'TappedIn'))) {
  try {
    renameSync(path.join(localData, 'RedZone'), path.join(localData, 'TappedIn'));
  } catch (err) {
    console.warn(`Could not move ${path.join(localData, 'RedZone')} to TappedIn (${err instanceof Error ? err.message : err}); you may need to sign in again.`);
  }
}

const { flags } = parseFlags(process.argv.slice(2));
const replayDate = typeof flags.replay === 'string' ? flags.replay : null;
const app = new App(loadConfig(), {
  setup: flags.setup === true,
  setupDemo: flags['setup-demo'] === true,
  dryRun: flags['dry-run'] === true || replayDate !== null,
  replay: replayDate
    ? { date: replayDate, fromMs: etTime(replayDate, typeof flags.from === 'string' ? flags.from : '19:00'), speed: Number(flags.speed ?? 10), synth: flags.synth === true }
    : undefined,
  homes: typeof flags.homes === 'string' ? flags.homes.split(',') : undefined,
  autoHomes: flags['no-auto'] !== true,
  audioMode: flags.audio === 'auto' || flags.audio === 'manual' ? flags.audio : undefined,
  record: flags['no-record'] !== true,
  shell: flags.chrome === true ? 'chrome' : 'electron',
});

// A stray background error must not close four streams mid-game: log it and keep running.
process.on('unhandledRejection', (err) => console.error(`unexpected error (TappedIn keeps running): ${err instanceof Error ? (err.stack ?? err.message) : err}`));

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  void app.stop().then(() => process.exit(0));
});

try {
  await app.start();
} catch (err) {
  console.error(`TappedIn failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
