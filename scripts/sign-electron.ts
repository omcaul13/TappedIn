// npm run sign-electron [-- <extra castLabs vmp arguments>]
// Signs node_modules/electron/dist for Widevine streaming with castLabs' EVS (uploads electron.exe to
// castLabs, writes electron.exe.sig). Uses the installer's private Python (.venv-evs, through
// scripts/evs.py, which trusts Windows' certificate store) when it exists, else `python` on PATH.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join('node_modules', 'electron', 'dist');
const venvPython = path.join(root, '.venv-evs', 'Scripts', 'python.exe');
const extra = process.argv.slice(2);

const [cmd, args] = existsSync(venvPython)
  ? [venvPython, ['-I', path.join(root, 'scripts', 'evs.py'), 'vmp', 'sign-pkg', dist, ...extra]]
  : ['python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', dist, ...extra]];

const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
if (r.error) {
  console.error(`Could not run ${cmd}: ${r.error.message}. Double-click "Setup RedZone.cmd" to set up signing.`);
  process.exitCode = 1;
} else {
  process.exitCode = r.status ?? 1;
}
