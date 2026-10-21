// TappedIn app window (castLabs Electron with Widevine): one frameless window, a 2x2 grid of video
// views showing the TV service's web player, and the TappedIn UI drawn on top in a transparent view.
//
// The shell only lays things out and signs the service in. The app (npm start) runs the engine and
// drives the views over the local debugging port with the same tuning and stream-health code as the
// Chrome tiles. Nothing here bypasses DRM or login: Widevine is castLabs' licensed CDM, and sign-in is
// the user's own: either they sign in themselves in a window shown for it, or (Xfinity On Campus only)
// TappedIn presses the "Watch Now" button you'd press on your own portal page.
// Everything about the service (URLs, partition, sign-in rules) comes from the --provider file that
// src/shell.ts writes from config/providers/<id>.json.
//
// Started by src/shell.ts with:
//   --port=<debugging port> --ui=<url> --user-data=<dir> --provider=<file> [--screens=4] [--spares=0]
//   [--signin=defer] [--no-dcomp]
// (always --name=value: Electron exits at once on some space-separated values like "--screens 4")
// Talks to the app over the Node IPC channel: sends ready / signin / closed / reply, accepts handoff /
// present / layout (per-screen fullscreen, top bar height) / quit, and requests { id, type } answered with { type: 'reply', id, ok, data | error }:
// configure (switch service, screens, spares in place), logout, signin-check, reveal, paths.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, WebContentsView, components, ipcMain, session, shell } = require('electron');
const { compile, rules } = require('./signin-rules.cjs');
const { screenRect } = require('./layout.cjs');

const args = process.argv.slice(2);
const value = (name, d) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : d;
};
const flag = (name) => args.includes(`--${name}`);

const clampScreens = (n) => Math.max(1, Math.min(4, Number(n) || 4));
const clampSpares = (n) => Math.max(0, Math.min(4, Number(n) || 0));
let SCREENS = clampScreens(value('screens', '4'));
// Standby views: the app loads a substitute in one while the screen keeps showing its game, and keeps
// a screen's own game playing in one (under the substitute) so going back is instant.
let SPARES = clampSpares(value('spares', '0'));
/** Bumped by every configure: view titles carry it, and sign-in news from an older service is dropped. */
let GEN = 0;
const PROVIDER_FILE = value('provider', '');
if (!PROVIDER_FILE) {
  console.error('main.cjs needs --provider=<file> (written by src/shell.ts)');
  process.exit(2);
}
/** The TV service (see ShellProvider in src/shell.ts) and what follows from it; replaced by configure. */
let SP, SIGNIN, R, PARTITION, HIDE_JS;
function loadProvider(file) {
  SP = JSON.parse(fs.readFileSync(file, 'utf8'));
  SIGNIN = SP.signin;
  R = rules(SP);
  PARTITION = SP.partition;
  HIDE_JS = buildHideJs();
}
const TOP_BAR = 36; // keep in sync with --top in src/ui/style.css
/** Height above the video grid: the top bar, or the big ticker when it covers the top bar (layout message). */
let TOP = TOP_BAR;
/** Per-screen fullscreen: the screen that fills the window (0: the grid). */
let FOCUS = 0;
const GAP = 2;
const BG = '#05070a';
const MAC = process.platform === 'darwin';

app.setName('TappedIn');
app.setPath('userData', value('user-data', path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'TappedIn', 'electron')));
app.commandLine.appendSwitch('remote-debugging-port', value('port', '9335'));
app.commandLine.appendSwitch('remote-allow-origins', 'http://127.0.0.1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// On some laptops (seen on Intel Arc + NVIDIA) the DirectComposition video path leaves views black.
if (flag('no-dcomp')) app.commandLine.appendSwitch('disable-direct-composition');

const send = (msg) => {
  if (process.send) process.send(msg);
  else console.log('[shell]', JSON.stringify(msg));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// While the player is up, shows only the main <video> (the one actually playing), filling the view.
// Visibility inherits through shadow DOM, so hiding the document and re-showing one video works inside
// web components (Xfinity's player). The guide stays visible: the in-app channel switch clicks a row
// in it (the UI covers the screen with a "Switching to…" card meanwhile). The provider can add CSS.
function buildHideJs() {
  const PLAYER_RE = compile(SP.playerUrl);
  const HIDE_CSS = 'html.rz-hide,html.rz-hide body{background:#000!important;cursor:none!important;overflow:hidden!important} html.rz-hide{visibility:hidden!important}' + (SP.hideCss ? ` ${SP.hideCss}` : '');
  return `(() => {
  if (window.__rzHide) return; window.__rzHide = true;
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(HIDE_CSS)};
  document.documentElement.appendChild(style);
  const playerRe = new RegExp(${JSON.stringify(PLAYER_RE.source)}, ${JSON.stringify(PLAYER_RE.flags)});
  let shown = null;
  const pick = () => {
    const player = playerRe.test(location.href);
    document.documentElement.classList.toggle('rz-hide', player);
    if (!player) return;
    const vids = [];
    const walk = (r) => { for (const v of r.querySelectorAll('video')) vids.push(v); for (const el of r.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); };
    walk(document);
    const area = (v) => v.clientWidth * v.clientHeight;
    const playing = vids.filter((v) => !v.paused && v.readyState >= 2);
    const v = (playing.length ? playing : vids).sort((a, b) => area(b) - area(a))[0];
    if (!v || v === shown) return;
    if (shown) shown.style.removeProperty('visibility');
    v.style.setProperty('visibility', 'visible', 'important');
    v.style.setProperty('object-fit', 'contain', 'important');
    shown = v;
  };
  pick(); setInterval(pick, ${Number(SP.hidePollMs) || 500});
})()`;
}
loadProvider(PROVIDER_FILE);

const isApp = (url) => R.isApp(url);
const marker = (label) =>
  `data:text/html,${encodeURIComponent(`<title>${label}</title><body style="margin:0;background:#000;color:#334155;font:600 15px system-ui;display:grid;place-items:center;height:100vh">${label}</body>`)}`;

/** Chrome's identifier without "Electron/…" (some services, Xfinity included, send Electron to an "update your browser" page). */
let ORIGINAL_UA = null;
function applyUserAgent() {
  ORIGINAL_UA ??= session.defaultSession.getUserAgent();
  const ua = SP.userAgent === 'chrome' ? ORIGINAL_UA.replace(/ Electron\/\S+/, '').replace(/ TappedIn\/\S+/, '') : ORIGINAL_UA;
  app.userAgentFallback = ua;
  session.defaultSession.setUserAgent(ua);
  session.fromPartition(PARTITION).setUserAgent(ua);
}

let win = null;
let ui = null;
/** Every video view by name (S1..S4, X1..): { view, cell, label } where cell is the screen it sits in. */
const views = new Map();
let signingIn = null;

/**
 * Signing the service in. First check whether it is still signed in from last time. If not:
 *  - with a portal (Xfinity On Campus): Xfinity Stream's own session doesn't survive a restart, but
 *    your Xfinity On Campus sign-in does, and clicking its "Watch Now" (in a hidden window) hands it to
 *    Xfinity Stream again. If the portal itself wants a sign-in, the window is shown so you can sign in.
 *  - without one: the service's page is shown and you sign in yourself (school SSO pop-ups included);
 *    TappedIn only watches for the signed-in page.
 */
const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => Promise.reject(new Error(`${what} took over ${ms / 1000}s`)))]);
const BODY_TEXT_JS = `document.body ? document.body.innerText.slice(0, 4000) : ''`;
const bodyText = (wc) => wc.executeJavaScript(BODY_TEXT_JS).catch(() => '');

/** Read the page until it looks signed in or out, for up to ms while it's still loading. True when signed in. */
async function waitSignedIn(wc, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const state = R.signinState(await bodyText(wc));
    if (state !== 'loading' || Date.now() >= deadline) return state === 'in';
    await sleep(500);
  }
}

/** Is the service still signed in from last time? (Then no sign-in is needed.) */
async function streamSignedIn(w) {
  try {
    await withTimeout(w.loadURL(SIGNIN.checkUrl), SIGNIN.checkTimeoutMs, SP.shortName);
    await sleep(SIGNIN.checkSettleMs);
    return isApp(w.webContents.getURL()) && (await waitSignedIn(w.webContents, SIGNIN.checkTimeoutMs));
  } catch (err) {
    send({ type: 'log', text: `sign-in check: ${err && err.message ? err.message : err}` });
    return false;
  }
}

/** Log each page of the sign-in flow by site and path only: sign-in URLs carry one-time codes and tokens in their query and fragment. */
function logNavigation(wc) {
  wc.on('did-navigate', (_e, url) => {
    let where = 'page';
    try {
      const u = new URL(url);
      where = `${u.origin}${u.pathname}`;
    } catch {}
    send({ type: 'log', text: `sign-in: ${where.slice(0, 100)}` });
  });
}

/** Portal hand-off (Xfinity On Campus "Watch Now"). */
async function portalHandoff(w, say) {
  say({ type: 'signin', state: 'signing-in', detail: `Opening ${SP.shortName} from ${SP.name}` });
  w.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { partition: PARTITION } } }));
  const stream = new Promise((resolve) => {
    const watch = (wc) => {
      logNavigation(wc);
      wc.on('did-finish-load', () => {
        if (isApp(wc.getURL())) resolve(wc);
      });
    };
    const onCreated = (_e, wc) => watch(wc);
    app.on('web-contents-created', onCreated);
    w.on('closed', () => app.off('web-contents-created', onCreated));
    watch(w.webContents);
  });
  await withTimeout(w.loadURL(SIGNIN.portalUrl), SIGNIN.portalTimeoutMs, SP.name);
  const click = SIGNIN.autoClick;
  let clicked = false;
  for (let i = 0; click && i < SIGNIN.autoClickTries && !clicked; i++) {
    clicked = await w.webContents
      .executeJavaScript(`(() => { const re = new RegExp(${JSON.stringify(click.text)}, 'i'); const el = document.querySelector(${JSON.stringify(click.selector)}) || [...document.querySelectorAll('a,button,[role=button]')].find((e) => re.test(e.textContent || '')); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; })()`)
      .catch(() => false);
    if (!clicked) await sleep(SIGNIN.autoClickIntervalMs);
  }
  if (!clicked) {
    w.show();
    say({ type: 'signin', state: 'needed', detail: SIGNIN.instructions });
  }
  const wc = await Promise.race([stream, sleep(clicked ? SIGNIN.waitAfterClickMs : SIGNIN.waitForUserMs).then(() => null)]);
  if (!wc) throw new Error(`${SP.shortName} did not open after the ${SP.name} hand-off`);
  await sleep(SIGNIN.handoffSettleMs); // let the service finish setting up its session
  // Xfinity spends its one-time hand-off token at once but writes its session seconds later:
  // closing the window before the signed-in page shows loses the sign-in.
  const ok = await waitSignedIn(wc, SIGNIN.waitAfterClickMs);
  say({ type: 'signin', state: ok ? 'ok' : 'failed', detail: ok ? `Signed in to ${SP.shortName}` : `${SP.shortName} still looks signed out` });
}

/** No portal: show the service's own sign-in and wait for any window of the flow to reach the signed-in page. */
async function interactiveSignin(w, say) {
  w.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: true, autoHideMenuBar: true, webPreferences: { partition: PARTITION } } }));
  const onCreated = (_e, wc) => logNavigation(wc);
  app.on('web-contents-created', onCreated);
  logNavigation(w.webContents);
  try {
    if (SIGNIN.startUrl) await w.loadURL(SIGNIN.startUrl).catch(() => {});
    w.show();
    say({ type: 'signin', state: 'needed', detail: SIGNIN.instructions });
    const deadline = Date.now() + SIGNIN.waitForUserMs;
    while (Date.now() < deadline) {
      await sleep(1000);
      const wins = BrowserWindow.getAllWindows().filter((bw) => bw !== win && !bw.isDestroyed());
      if (!wins.length) throw new Error('the sign-in window was closed');
      const pages = await Promise.all(wins.map(async (bw) => ({ url: bw.webContents.getURL(), bodyText: await bodyText(bw.webContents) })));
      if (R.signinDone(pages)) {
        await sleep(SIGNIN.handoffSettleMs);
        say({ type: 'signin', state: 'ok', detail: `Signed in to ${SP.shortName}` });
        return;
      }
    }
    throw new Error(`no sign-in to ${SP.shortName} within ${Math.round(SIGNIN.waitForUserMs / 60000)} min`);
  } finally {
    app.off('web-contents-created', onCreated);
  }
}

async function handoff() {
  if (signingIn) return signingIn;
  const gen = GEN;
  // A configure (another service) makes this sign-in stale: its news is dropped.
  const say = (m) => {
    if (gen === GEN) send(m);
  };
  const run = (async () => {
    say({ type: 'signin', state: 'signing-in', detail: `Checking ${SP.shortName}` });
    const w = new BrowserWindow({ width: 1100, height: 760, show: false, title: SIGNIN.windowTitle, backgroundColor: BG, parent: win || undefined, webPreferences: { partition: PARTITION } });
    w.setMenuBarVisibility(false);
    if (await streamSignedIn(w)) {
      say({ type: 'signin', state: 'ok', detail: `Signed in to ${SP.shortName}` });
      if (!w.isDestroyed()) w.destroy();
      return;
    }
    try {
      if (SIGNIN.portalUrl) await portalHandoff(w, say);
      else await interactiveSignin(w, say);
    } catch (err) {
      say({ type: 'signin', state: 'failed', detail: String(err && err.message ? err.message : err) });
    } finally {
      if (gen === GEN) closeSigninWindows();
    }
  })().finally(() => {
    if (signingIn === run) signingIn = null;
  });
  signingIn = run;
  return run;
}

/** Close every window but the app window (sign-in windows and their pop-ups). */
function closeSigninWindows() {
  for (const bw of BrowserWindow.getAllWindows()) if (bw !== win && !bw.isDestroyed()) bw.destroy();
}

function cellBounds(screen) {
  const [w, h] = win.getContentSize();
  return screenRect(SCREENS, screen, w, h, TOP, GAP, FOCUS);
}

/** The view on top in each screen (the one you see), by screen number. */
const topView = new Map();

/** Keep the fullscreen screen above every other screen's views (and the UI above it). */
function raiseFocus() {
  const v = FOCUS ? views.get(topView.get(FOCUS)) : null;
  if (!v || !win) return;
  win.contentView.addChildView(v.view);
  win.contentView.addChildView(ui);
}

/**
 * Per-screen fullscreen and the height above the grid. Only bounds and stacking change: no view is
 * reloaded or rebuilt, so every stream keeps playing (the others stay their size, covered).
 */
function setLayout(msg) {
  FOCUS = Number(msg.focus) >= 1 && Number(msg.focus) <= SCREENS ? Number(msg.focus) : 0;
  TOP = Math.max(0, Math.min(400, Math.round(Number(msg.top) || TOP_BAR)));
  layout();
  raiseFocus();
  send({ type: 'log', text: `layout: ${FOCUS ? `screen ${FOCUS} fullscreen` : 'grid'}, grid starts ${TOP}px down (views resized, none reloaded)` });
}

function layout() {
  if (!win) return;
  for (const { view, cell } of views.values()) view.setBounds(cellBounds(cell));
  const [w, h] = win.getContentSize();
  if (ui) ui.setBounds({ x: 0, y: 0, width: w, height: h });
}

/**
 * Show view `name` in a screen's cell, on top of whatever else sits there. Views underneath keep the
 * same size and stay "visible" to the page, so a parked stream keeps playing.
 */
function present(screen, name) {
  const v = views.get(name);
  if (!v || !win) return;
  v.cell = screen;
  topView.set(screen, name);
  v.view.setBounds(cellBounds(screen));
  win.contentView.addChildView(v.view); // re-adding moves it to the top…
  win.contentView.addChildView(ui); // …and the UI goes back above it
  // A background screen switching channels must not come up over the fullscreen one.
  if (FOCUS && screen !== FOCUS) raiseFocus();
}

const markerTitle = (kind, n) => `RZ-${kind}-${n}${GEN ? `-g${GEN}` : ''}`; // same rule as src/shell.ts

function destroyViews() {
  for (const { view } of views.values()) {
    if (win) win.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
  views.clear();
}

function createViews() {
  const make = (name, label, cell) => {
    const v = new WebContentsView({ webPreferences: { partition: PARTITION, backgroundThrottling: false } });
    v.setBackgroundColor('#000000');
    const hide = () => {
      if (isApp(v.webContents.getURL())) v.webContents.executeJavaScript(HIDE_JS).catch(() => {});
    };
    v.webContents.on('did-finish-load', hide);
    v.webContents.on('did-navigate-in-page', hide);
    v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Every page load, counted per view (no URL: they can carry tokens). Fullscreen and ticker changes
    // must never cause one; channel changes do.
    let loads = 0;
    v.webContents.on('did-start-navigation', (details) => {
      if (details && details.isMainFrame && !details.isSameDocument) send({ type: 'log', text: `view ${name}: page load #${++loads}` });
    });
    v.webContents.loadURL(marker(label));
    win.contentView.addChildView(v, 0); // below everything, the screen views go on top of spares
    views.set(name, { view: v, cell, label });
  };
  for (let i = 0; i < SPARES; i++) make(`X${i + 1}`, markerTitle('SPARE', i + 1), (i % SCREENS) + 1);
  for (let i = 0; i < SCREENS; i++) make(`S${i + 1}`, markerTitle('SCREEN', i + 1), i + 1);
  for (let i = 0; i < SCREENS; i++) present(i + 1, `S${i + 1}`);
  layout();
  raiseFocus();
}

/** Switch service, screen count or standby views in place: the window stays, the video views are rebuilt. */
async function configure(msg) {
  GEN++;
  signingIn = null;
  closeSigninWindows();
  loadProvider(String(msg.provider));
  SCREENS = clampScreens(msg.screens);
  SPARES = clampSpares(msg.spares);
  if (FOCUS > SCREENS) FOCUS = 0;
  topView.clear();
  applyUserAgent();
  destroyViews();
  createViews();
  if (msg.signin === 'now') void handoff();
  return { screens: SCREENS, spares: SPARES, generation: GEN };
}

/** Forget this service's sign-in (its partition only), and park every view on its marker page. */
async function logout() {
  GEN++; // any sign-in in progress is stale now
  signingIn = null;
  closeSigninWindows();
  await session.fromPartition(PARTITION).clearStorageData();
  for (const { view, label } of views.values()) await view.webContents.loadURL(marker(label)).catch(() => {});
}

/** What sign-in detection sees on the check page (site and path only: URLs can carry tokens). */
async function signinCheck() {
  const w = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION } });
  try {
    await withTimeout(w.loadURL(SIGNIN.checkUrl), SIGNIN.checkTimeoutMs, SP.shortName).catch(() => {});
    await sleep(SIGNIN.checkSettleMs);
    const url = w.webContents.getURL();
    let where = url;
    try {
      const u = new URL(url);
      where = `${u.origin}${u.pathname}`;
    } catch {}
    return { url: where, isApp: R.isApp(url), signedOut: !(await waitSignedIn(w.webContents, SIGNIN.checkTimeoutMs)) };
  } finally {
    if (!w.isDestroyed()) w.destroy();
  }
}

const REQUESTS = {
  configure,
  logout,
  'signin-check': signinCheck,
  // The app checks the path is a TappedIn export before asking.
  reveal: async (msg) => shell.showItemInFolder(String(msg.file)),
  paths: async () => ({ documents: app.getPath('documents') }),
};

function toggleFullscreen() {
  if (win) win.setFullScreen(!win.isFullScreen());
}

/**
 * The Mac menu bar: without one, ⌘C/⌘V/⌘Q do nothing (sign-in windows included). Settings… opens the
 * UI's settings drawer, and Toggle Full Screen is the native one (its own Space), like the green button.
 */
function macMenu() {
  const { SITE_URL } = require('./mac-updates.cjs');
  app.setAboutPanelOptions({ applicationName: 'TappedIn', applicationVersion: app.getVersion(), version: '' });
  return Menu.buildFromTemplate([
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => ui && ui.webContents.send('rz:open-settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload Controls', accelerator: 'Cmd+R', click: () => ui && ui.webContents.reload() },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'Ctrl+Cmd+F', click: toggleFullscreen },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }, { type: 'separator' }, { role: 'front' }] },
    {
      role: 'help',
      submenu: [
        { label: 'TappedIn Website', click: () => shell.openExternal(SITE_URL) },
        { label: 'Install Guide', click: () => shell.openExternal(`${SITE_URL}/install`) },
        { label: 'Report a Problem…', click: () => shell.openExternal('mailto:tappedinsupport@gmail.com?subject=TappedIn%20for%20Mac') },
      ],
    },
  ]);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(MAC ? macMenu() : null);
  await components.whenReady();
  applyUserAgent();

  const winOptions = {
    width: 1600,
    height: 940,
    show: false,
    title: 'TappedIn',
    icon: path.join(__dirname, 'tappedin.ico'),
    backgroundColor: BG,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0f14', symbolColor: '#cbd5e1', height: TOP_BAR },
  };
  if (MAC) {
    // The bundle carries the icon; the traffic lights sit centered in the top bar's left end (the UI leaves room).
    delete winOptions.icon;
    delete winOptions.titleBarOverlay;
    winOptions.trafficLightPosition = { x: 14, y: Math.round((TOP_BAR - 12) / 2) };
  }
  win = new BrowserWindow(winOptions);
  win.maximize();
  win.show();

  ui = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'ui-preload.cjs'), transparent: true } });
  ui.setBackgroundColor('#00000000');
  win.contentView.addChildView(ui);
  ui.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Escape' && win.isFullScreen())) {
      e.preventDefault();
      if (input.key === 'F11') toggleFullscreen();
      else win.setFullScreen(false);
    }
  });
  ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ui.webContents.loadURL(value('ui', 'http://localhost:7480/ui'));
  win.on('resize', layout);
  win.on('enter-full-screen', () => ui.webContents.send('rz:fullscreen', true));
  win.on('leave-full-screen', () => ui.webContents.send('rz:fullscreen', false));
  win.on('closed', () => {
    win = null;
    send({ type: 'closed' });
    app.quit();
  });
  layout();
  ui.webContents.focus();

  ipcMain.handle('rz:toggle-fullscreen', () => {
    toggleFullscreen();
    return win ? win.isFullScreen() : false;
  });

  if (value('signin', 'now') !== 'defer') await handoff();
  createViews();
  send({ type: 'ready', screens: SCREENS, spares: SPARES });

  const macUpdates = MAC && (require('../package.json').tappedin || {}).macUpdates;
  if (macUpdates) {
    const { startUpdates } = require('./mac-updates.cjs');
    const log = (text) => send({ type: 'log', text });
    // After start-up has settled (sign-in, first tunes), so a dialog doesn't land in the middle of it.
    setTimeout(() => startUpdates({ mode: macUpdates, version: app.getVersion(), win, log }).catch((err) => log(`update: ${err.message}`)), 30_000);
  }
});

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (typeof msg.id === 'number' && REQUESTS[msg.type]) {
    Promise.resolve()
      .then(() => REQUESTS[msg.type](msg))
      .then((data) => send({ type: 'reply', id: msg.id, ok: true, data }))
      .catch((err) => send({ type: 'reply', id: msg.id, ok: false, error: String(err && err.message ? err.message : err) }));
    return;
  }
  if (msg.type === 'handoff') void handoff();
  else if (msg.type === 'present') present(Number(msg.screen), String(msg.view));
  else if (msg.type === 'layout') setLayout(msg);
  else if (msg.type === 'quit') app.quit();
});
process.on('disconnect', () => app.quit()); // the app went away

app.on('window-all-closed', () => {
  if (!signingIn) app.quit();
});
