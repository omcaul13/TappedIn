// Headless live director: polls ESPN, runs the engine, logs every decision. No windows yet (Phase 2),
// so you can watch what it *would* do against tonight's games.
//   npm run director                                 # auto-pick 4 home games
//   npm run director -- --homes 401856700,401856701,401856702,401856703
//   npm run director -- --audio auto                 # also show auto-audio moves
// Edit config/tappedin.config.json5 while it runs: thresholds apply on the next tick.
import { loadConfig, PROJECT_ROOT, watchConfig } from '../src/config';
import { parseFlags } from '../src/cli';
import { espnDateKey } from '../src/espn/client';
import { LiveSource, recordingDir } from '../src/espn/source';
import { Engine, type TickResult } from '../src/engine/engine';
import { clock, dailyLogFile, DecisionLog, formatEntry } from '../src/log';
import { autoHomes } from '../src/sim';

const { flags } = parseFlags(process.argv.slice(2));
let cfg = loadConfig();
const date = typeof flags.day === 'string' ? flags.day : espnDateKey();
const engine = new Engine(cfg);
if (flags.audio === 'auto' || flags.audio === 'manual') engine.setAudioMode(flags.audio);
const log = new DecisionLog({ file: () => dailyLogFile(PROJECT_ROOT), console: true });
const now = () => Date.now();

const record = (r: TickResult) => {
  for (const d of r.decisions) log.write({ type: 'decision', ...d });
  for (const a of r.assessments) log.write({ type: 'assess', ...a });
  for (const a of r.audio) log.write({ type: 'audio', ...a });
};

const source = new LiveSource(
  cfg,
  {
    scoreboard: (body, at, sport) => engine.ingestScoreboard(body, at, sport),
    summary: (id, body, at) => engine.ingestSummary(id, body, at),
    error: (what, err) => log.write({ type: 'info', at: now(), text: `ESPN ${what} failed: ${err}` }),
  },
  { date: () => date, interesting: () => engine.interestingGameIds(), recordDir: flags['no-record'] ? null : (d) => recordingDir(PROJECT_ROOT, `${d}-live`) },
);

const stopWatching = watchConfig(
  (next) => {
    cfg = next;
    engine.setConfig(next);
    source.setConfig(next);
    log.write({ type: 'info', at: now(), text: 'config reloaded' });
  },
  (msg) => log.write({ type: 'info', at: now(), text: `config NOT reloaded: ${msg}` }),
);

source.start();
log.write({ type: 'info', at: now(), text: `director started for ${date}; log ${dailyLogFile(PROJECT_ROOT)}` });

let homesSet = false;
let lastStatus = 0;
const timer = setInterval(() => {
  const t = now();
  record(engine.tick(t));
  if (!homesSet && engine.store.all().length) {
    const homes = typeof flags.homes === 'string' ? flags.homes.split(',') : autoHomes(engine.views(), t);
    if (homes.length) {
      homesSet = true;
      homes.slice(0, 4).forEach((gameId, i) => record(engine.act({ type: 'setHome', screen: i + 1, gameId }, t)));
    }
  }
  if (t - lastStatus > 60_000 && homesSet) {
    lastStatus = t;
    const views = engine.views();
    const parts = engine.director.screens.map((s) => {
      const home = s.homeGameId ? views.get(s.homeGameId) : undefined;
      const on = s.showing.kind === 'game' ? (views.get(s.showing.gameId)?.game.shortName ?? '?') : s.showing.kind;
      return `S${s.id} ${s.mode}${s.mode === 'HOME' ? '' : ` on ${on}`} (home ${home?.game.shortName ?? '-'} ${home?.assessment.state ?? ''})`;
    });
    console.log(`${clock(t)} [status] ${parts.join(' | ')} | audio S${engine.audio.focus} (${engine.audio.mode})`);
  }
}, cfg.director.tickSeconds * 1000);

process.on('SIGINT', () => {
  clearInterval(timer);
  source.stop();
  stopWatching();
  console.log(formatEntry({ type: 'info', at: now(), text: 'stopped' }));
  process.exit(0);
});
