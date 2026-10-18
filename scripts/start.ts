// RedZone Director.
//   npm start                                   live: one RedZone window, ESPN + Xfinity video in a 2x2 grid
//   npm run start:chrome                        the original four Chrome tile windows + control panel
//   npm start -- --dry-run                      live ESPN data, data tiles instead of video (uses no streams)
//   npm start -- --replay 20261017 --from 19:30 --speed 10     a recorded night, sped up (data tiles)
//   npm start -- --replay 20261010 --synth --from 15:30 --speed 20
//   options: --homes id,id,id,id   --no-auto (start with no home games; pick them per screen)
//            --audio auto|manual   --no-record   --chrome
// Old control panel (both shells): http://localhost:7480/panel
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseFlags } from '../src/cli';
import { loadConfig, PROJECT_ROOT } from '../src/config';
import { App } from '../src/app';
import { etTime } from '../src/sim';

// Secrets (YT_API_KEY for YouTube highlights) live in .env, never in the config file.
const envFile = path.join(PROJECT_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

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

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  void app.stop().then(() => process.exit(0));
});

try {
  await app.start();
} catch (err) {
  console.error(`RedZone failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
