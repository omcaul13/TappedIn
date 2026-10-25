// App updates. The builds write into the app's package.json:
//  - Mac (installer/mac/build-mac.sh): "tappedin": { "macUpdates": "auto" | "notice" }
//    - auto: the app is Developer ID signed, so Squirrel.Mac (built into Electron) downloads the new version
//      and installs it on restart. The site's /api/update/mac/<version> says whether there is one.
//    - notice: the app is only ad-hoc signed, which Squirrel refuses; say a new version is out and link to it.
//  - Windows (scripts/build-installer.ps1): "tappedin": { "winUpdates": "notice" }: say a new installer is out
//    and link to it (running it installs over this version).
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

/** What the "new version" dialog says to do, per platform. */
const HOW = {
  mac: 'Download the new version, open it and drag TappedIn into Applications to replace this one. Your settings and sign-ins are kept.',
  windows: 'Download the new installer and run it: it installs over this version. Your settings and sign-ins are kept.',
};

/** `electron` is a parameter only so tests can pass a stand-in. */
async function startUpdates({ mode, platform, version, win, log, electron = require('electron') }) {
  const { autoUpdater, dialog, shell } = electron;
  if (mode === 'auto' && platform === 'mac') {
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
    const latest = await fetch(`${SITE_URL}/api/latest${platform === 'mac' ? '?platform=mac' : ''}`, { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!latest || typeof latest.version !== 'string' || !isNewer(latest.version, version)) {
      log(`update: ${version} is current (the site has ${latest && typeof latest.version === 'string' ? latest.version : 'no version'})`);
      return;
    }
    log(`update: ${latest.version} is available (this is ${version})`);
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `TappedIn ${latest.version} is available`,
      detail: `You have ${version}. ${HOW[platform]}`,
    });
    if (response === 0) await shell.openExternal(`${SITE_URL}/download/${platform}`);
  }
}

module.exports = { SITE_URL, isNewer, startUpdates };
