// Starts TappedIn without a console window. Shortcuts run `electron.exe electron\launcher.cjs`:
// electron.exe is a windowed program, so nothing flashes up. It starts the app's Node process hidden,
// keeps its output in logs\launcher.log and shows a message if TappedIn stops with an error.
// TappedIn.cmd still starts it with a console, for a terminal or for debugging.
const { app, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bundled = path.join(root, 'runtime', 'node.exe');
// The installer ships its own Node in runtime\; a source checkout uses the one on PATH.
const node = fs.existsSync(bundled) ? bundled : 'node';
const logDir = path.join(root, 'logs');
const logFile = path.join(logDir, 'launcher.log');

fs.mkdirSync(logDir, { recursive: true });
const out = fs.openSync(logFile, 'w');
const args = [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'scripts', 'start.ts'), ...process.argv.slice(2)];
const child = spawn(node, args, { cwd: root, stdio: ['ignore', out, out], windowsHide: true });

function fail(text) {
  const tail = (() => {
    try {
      return fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).slice(-8).join('\n');
    } catch {
      return '';
    }
  })();
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'TappedIn',
    message: text,
    detail: `${tail ? `${tail}\n\n` : ''}If you installed it with TappedIn-Setup.exe, run that installer again. Otherwise run "npm run doctor" in ${root}.\n\nFull log: ${logFile}`,
  });
}

child.on('error', (err) => {
  app.whenReady().then(() => {
    fail(`TappedIn could not start (${err.message}).`);
    app.exit(1);
  });
});
child.on('exit', (code) => {
  app.whenReady().then(() => {
    if (code) fail('TappedIn stopped with an error.');
    app.exit(code ?? 0);
  });
});
// No windows of its own: stay alive until the app's Node process ends.
app.on('window-all-closed', () => {});
