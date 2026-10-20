// Starts TappedIn without a console window. Shortcuts run `electron.exe electron\launcher.cjs`:
// electron.exe is a windowed program, so nothing flashes up. It starts the app's Node process hidden,
// keeps its output in logs\launcher.log and shows a message if TappedIn stops with an error.
// TappedIn.cmd still starts it with a console, for a terminal or for debugging.
const { app, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
// The Mac app (TappedIn.app) is read-only: its data goes to ~/Library/Application Support/TappedIn.
const mac = process.platform === 'darwin';
const dataDir = mac ? path.join(app.getPath('appData'), 'TappedIn') : root;
const bundled = path.join(root, 'runtime', mac ? 'node' : 'node.exe');
// The installer ships its own Node in runtime\; a source checkout uses the one on PATH.
const node = fs.existsSync(bundled) ? bundled : 'node';
const logDir = path.join(dataDir, 'logs');
const logFile = path.join(logDir, 'launcher.log');

if (mac) {
  // Only the window's process (the same app, started by the Node process) belongs in the Dock.
  app.dock.hide();
  app.setPath('userData', path.join(dataDir, 'launcher'));
}
fs.mkdirSync(logDir, { recursive: true });
const out = fs.openSync(logFile, 'w');
// `electron launcher.cjs <args>` puts the script at argv[1]; the Mac app (packaged, no script) has its arguments from argv[1].
const args = [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'scripts', 'start.ts'), ...process.argv.slice(mac && !process.defaultApp ? 1 : 2)];
const env = mac ? { ...process.env, TAPPEDIN_DATA_DIR: dataDir, TAPPEDIN_ELECTRON: process.execPath } : process.env;
const child = spawn(node, args, { cwd: root, env, stdio: ['ignore', out, out], windowsHide: true });

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
    detail: mac
      ? `${tail ? `${tail}\n\n` : ''}Download TappedIn again and drag it into Applications, replacing the old copy. Your settings are kept.\n\nFull log: ${logFile}`
      : `${tail ? `${tail}\n\n` : ''}If you installed it with TappedIn-Setup.exe, run that installer again. Otherwise run "npm run doctor" in ${root}.\n\nFull log: ${logFile}`,
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
