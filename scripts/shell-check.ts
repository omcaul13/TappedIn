// Diagnostics: start the app window shell alone and print everything it says (npm run shell-check).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadConfig, PROJECT_ROOT } from '../src/config';

const cfg = loadConfig();
const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const env = { ...process.env };
delete env.NODE_OPTIONS;
console.log('node-ish env:', Object.keys(env).filter((k) => /^(NODE|TSX|ELECTRON|npm_config_node)/i.test(k)).join(', ') || 'none');
const args = [path.join(PROJECT_ROOT, 'electron', 'main.cjs'), `--port=${cfg.electron.debugPort}`, '--ui=about:blank', `--user-data=${cfg.electron.userDataDir}`, '--screens=4', '--no-dcomp'];
console.log('spawn', electronPath, args.join(' '));
const child = spawn(electronPath, args, { cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
child.stdout?.on('data', (d) => process.stdout.write(`[out] ${d}`));
child.stderr?.on('data', (d) => process.stdout.write(`[err] ${d}`));
child.on('message', (m) => console.log('[msg]', JSON.stringify(m)));
child.on('exit', (c, sig) => {
  console.log('exit', c, sig);
  process.exit(0);
});
setTimeout(() => {
  console.log('still running after 8s');
  child.kill();
}, 8000);
