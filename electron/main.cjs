// RedZone app window (castLabs Electron with Widevine): one frameless window, a 2x2 grid of Xfinity
// views, and the RedZone UI drawn on top of them in a transparent view.
//
// The shell only lays things out and signs Xfinity Stream in. The app (npm start) runs the engine
// and drives the Xfinity views over the local debugging port with the same tuning and stream-health
// code as the Chrome tiles. Nothing here bypasses DRM or login: Widevine is castLabs' licensed CDM,
// and sign-in is the "Watch Now" click you'd make on your own Xfinity On Campus page.
//
// Started by src/shell.ts with:
//   --port=<debugging port> --ui=<url> --user-data=<dir> [--screens=4] [--no-dcomp]
// (always --name=value: Electron exits at once on some space-separated values like "--screens 4")
// Talks to the app over the Node IPC channel: sends ready / signin / closed, accepts handoff / quit.
const path = require('node:path');
const { app, BrowserWindow, Menu, WebContentsView, components, ipcMain, session } = require('electron');

const args = process.argv.slice(2);
const value = (name, d) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : d;
};
const flag = (name) => args.includes(`--${name}`);

const SCREENS = Math.max(1, Math.min(4, Number(value('screens', '4'))));
// Standby views: the app loads a substitute in one while the screen keeps showing its game, and keeps
// a screen's own game playing in one (under the substitute) so going back is instant.
const SPARES = Math.max(0, Math.min(4, Number(value('spares', '0'))));
const PARTITION = 'persist:xfinity';
const TOP_BAR = 36; // keep in sync with --top in src/ui/style.css
const GAP = 2;
const BG = '#05070a';

app.setName('RedZone');
app.setPath('userData', value('user-data', path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'RedZone', 'electron')));
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
// Xfinity's components. The guide stays visible: the in-app channel switch clicks a row in it (the UI
// covers the screen with a "Switching to…" card meanwhile).
const HIDE_JS = `(() => {
  if (window.__rzHide) return; window.__rzHide = true;
  const style = document.createElement('style');
  style.textContent = 'html.rz-hide,html.rz-hide body{background:#000!important;cursor:none!important;overflow:hidden!important} html.rz-hide{visibility:hidden!important}';
  document.documentElement.appendChild(style);
  let shown = null;
  const pick = () => {
    const player = location.pathname.includes('/stream/live/');
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
  pick(); setInterval(pick, 500);
})()`;

const isXfinity = (url) => /^https:\/\/www\.xfinity\.com\/stream/.test(url);
const marker = (label) =>
  `data:text/html,${encodeURIComponent(`<title>${label}</title><body style="margin:0;background:#000;color:#334155;font:600 15px system-ui;display:grid;place-items:center;height:100vh">${label}</body>`)}`;

/** Chrome's identifier without "Electron/…" (Xfinity sends Electron to an "update your browser" page). */
function useChromeUserAgent() {
  const ua = session.defaultSession.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ RedZone\/\S+/, '');
  app.userAgentFallback = ua;
  session.defaultSession.setUserAgent(ua);
  session.fromPartition(PARTITION).setUserAgent(ua);
}

let win = null;
let ui = null;
/** Every Xfinity view by name (S1..S4, X1..): { view, cell } where cell is the screen it sits in. */
const views = new Map();
let signingIn = null;

/**
 * Xfinity Stream's own session doesn't survive a restart; your Xfinity On Campus sign-in does.
 * Clicking its "Watch Now" (in a hidden window) hands it to Xfinity Stream again. If the portal itself
 * wants a sign-in, the window is shown so you can sign in yourself.
 */
const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => Promise.reject(new Error(`${what} took over ${ms / 1000}s`)))]);
const SIGNED_OUT_JS = `/\\bSign In\\b/.test(document.body ? document.body.innerText.slice(0, 4000) : '')`;

/** Is Xfinity Stream still signed in from last time? (Then the Watch Now hand-off isn't needed.) */
async function streamSignedIn(w) {
  try {
    await withTimeout(w.loadURL('https://www.xfinity.com/stream/'), 20000, 'Xfinity Stream');
    await sleep(4000);
    return isXfinity(w.webContents.getURL()) && !(await w.webContents.executeJavaScript(SIGNED_OUT_JS));
  } catch (err) {
    send({ type: 'log', text: `sign-in check: ${err && err.message ? err.message : err}` });
    return false;
  }
}

async function handoff() {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    send({ type: 'signin', state: 'signing-in', detail: 'Checking Xfinity Stream' });
    const w = new BrowserWindow({ width: 1100, height: 760, show: false, title: 'RedZone: sign in to Xfinity On Campus', backgroundColor: BG, webPreferences: { partition: PARTITION } });
    w.setMenuBarVisibility(false);
    if (await streamSignedIn(w)) {
      send({ type: 'signin', state: 'ok', detail: 'Signed in to Xfinity Stream' });
      w.destroy();
      signingIn = null;
      return;
    }
    send({ type: 'signin', state: 'signing-in', detail: 'Opening Xfinity Stream from Xfinity On Campus' });
    w.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { partition: PARTITION } } }));
    const stream = new Promise((resolve) => {
      const watch = (wc) => {
        // Site and path only: sign-in URLs carry one-time codes and tokens in their query and fragment.
        wc.on('did-navigate', (_e, url) => {
          let where = 'page';
          try {
            const u = new URL(url);
            where = `${u.origin}${u.pathname}`;
          } catch {}
          send({ type: 'log', text: `sign-in: ${where.slice(0, 100)}` });
        });
        wc.on('did-finish-load', () => {
          if (isXfinity(wc.getURL())) resolve(wc);
        });
      };
      const onCreated = (_e, wc) => watch(wc);
      app.on('web-contents-created', onCreated);
      w.on('closed', () => app.off('web-contents-created', onCreated));
      watch(w.webContents);
    });
    try {
      await withTimeout(w.loadURL('https://www.xfinityoncampus.com/'), 30000, 'Xfinity On Campus');
      let clicked = false;
      for (let i = 0; i < 30 && !clicked; i++) {
        clicked = await w.webContents
          .executeJavaScript(`(() => { const el = document.querySelector('a.watch-now-btn') || [...document.querySelectorAll('a,button,[role=button]')].find((e) => /watch now/i.test(e.textContent || '')); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); return true; })()`)
          .catch(() => false);
        if (!clicked) await sleep(500);
      }
      if (!clicked) {
        w.show();
        send({ type: 'signin', state: 'needed', detail: 'Sign in to Xfinity On Campus in the window that opened, then click Watch Now' });
      }
      const wc = await Promise.race([stream, sleep(clicked ? 40_000 : 600_000).then(() => null)]);
      if (!wc) throw new Error('Xfinity Stream did not open after Watch Now');
      await sleep(5000); // let Xfinity Stream finish setting up its session
      const signedIn = await wc.executeJavaScript(`!(${SIGNED_OUT_JS})`).catch(() => null);
      send({ type: 'signin', state: signedIn === false ? 'failed' : 'ok', detail: signedIn === false ? 'Xfinity Stream still shows "Sign In"' : 'Signed in to Xfinity Stream' });
    } catch (err) {
      send({ type: 'signin', state: 'failed', detail: String(err && err.message ? err.message : err) });
    } finally {
      for (const bw of BrowserWindow.getAllWindows()) if (bw !== win && !bw.isDestroyed()) bw.destroy();
      signingIn = null;
    }
  })();
  return signingIn;
}

function cellBounds(screen) {
  const [w, h] = win.getContentSize();
  const gh = Math.max(0, h - TOP_BAR);
  const cw = Math.floor((w - GAP) / 2);
  const ch = Math.floor((gh - GAP) / 2);
  const col = (screen - 1) % 2;
  const row = Math.floor((screen - 1) / 2);
  return { x: col * (cw + GAP), y: TOP_BAR + row * (ch + GAP), width: col ? w - cw - GAP : cw, height: row ? gh - ch - GAP : ch };
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
  v.view.setBounds(cellBounds(screen));
  win.contentView.addChildView(v.view); // re-adding moves it to the top…
  win.contentView.addChildView(ui); // …and the UI goes back above it
}

function createViews() {
  const make = (name, label, cell) => {
    const v = new WebContentsView({ webPreferences: { partition: PARTITION, backgroundThrottling: false } });
    v.setBackgroundColor('#000000');
    const hide = () => {
      if (isXfinity(v.webContents.getURL())) v.webContents.executeJavaScript(HIDE_JS).catch(() => {});
    };
    v.webContents.on('did-finish-load', hide);
    v.webContents.on('did-navigate-in-page', hide);
    v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    v.webContents.loadURL(marker(label));
    win.contentView.addChildView(v, 0); // below everything, the screen views go on top of spares
    views.set(name, { view: v, cell });
  };
  for (let i = 0; i < SPARES; i++) make(`X${i + 1}`, `RZ-SPARE-${i + 1}`, (i % SCREENS) + 1);
  for (let i = 0; i < SCREENS; i++) make(`S${i + 1}`, `RZ-SCREEN-${i + 1}`, i + 1);
  for (let i = 0; i < SCREENS; i++) present(i + 1, `S${i + 1}`);
  layout();
}

function toggleFullscreen() {
  if (win) win.setFullScreen(!win.isFullScreen());
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await components.whenReady();
  useChromeUserAgent();

  win = new BrowserWindow({
    width: 1600,
    height: 940,
    show: false,
    title: 'RedZone',
    backgroundColor: BG,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0f14', symbolColor: '#cbd5e1', height: TOP_BAR },
  });
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

  await handoff();
  createViews();
  send({ type: 'ready', screens: SCREENS, spares: SPARES });
});

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'handoff') void handoff();
  else if (msg.type === 'present') present(Number(msg.screen), String(msg.view));
  else if (msg.type === 'quit') app.quit();
});
process.on('disconnect', () => app.quit()); // the app went away

app.on('window-all-closed', () => {
  if (!signingIn) app.quit();
});
