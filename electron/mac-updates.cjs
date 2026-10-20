// Mac app updates (main.cjs loads this on macOS only). The Mac build writes
// "tappedin": { "macUpdates": "auto" | "notice" } into the app's package.json:
//  - auto: the app is Developer ID signed, so Squirrel.Mac (built into Electron) downloads the new version
//    and installs it on restart. The site's /api/update/mac/<version> says whether there is one.
//  - notice: the app is only ad-hoc signed, which Squirrel refuses; say a new version is out and link to it.
// A source checkout has neither and never checks.
const SITE_URL = 'https://tappedin-4ot.pages.dev';

/** Is version a newer than b? A prerelease (0.2.0-beta.1) is older than its release (0.2.0). */
function isNewer(a, b) {
  const parse = (v) => {
    const s = String(v).trim().replace(/^v/, '');
    const dash = s.indexOf('-');
    const core = dash < 0 ? s : s.slice(0, dash);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre: dash < 0 ? '' : s.slice(dash + 1) };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d > 0;
  }
  if (x.pre === y.pre) return false;
  if (!x.pre || !y.pre) return !x.pre;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true }) > 0;
}

async function startUpdates({ mode, version, win, log }) {
  const { autoUpdater, dialog, shell } = require('electron');
  if (mode === 'auto') {
    autoUpdater.on('error', (err) => log(`update: ${err && err.message ? err.message : err}`));
    autoUpdater.on('update-downloaded', async (_e, _notes, name) => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: `TappedIn ${name || 'update'} is ready`,
        detail: 'Restart TappedIn to finish updating, or it updates the next time you quit.',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.setFeedURL({ url: `${SITE_URL}/api/update/mac/${encodeURIComponent(version)}` });
    autoUpdater.checkForUpdates();
  } else if (mode === 'notice') {
    const latest = await fetch(`${SITE_URL}/api/latest?platform=mac`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!latest || typeof latest.version !== 'string' || !isNewer(latest.version, version)) return;
    log(`update: ${latest.version} is available (this is ${version})`);
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `TappedIn ${latest.version} is available`,
      detail: `You have ${version}. Download the new version, open it and drag TappedIn into Applications to replace this one. Your settings and sign-ins are kept.`,
    });
    if (response === 0) await shell.openExternal(`${SITE_URL}/download/mac`);
  }
}

module.exports = { SITE_URL, isNewer, startUpdates };
