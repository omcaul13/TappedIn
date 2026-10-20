// Option A spike: can Xfinity Stream play inside castLabs' Widevine-enabled Electron (ECS)?
//   npx electron electron/spike.cjs --login             sign in to Xfinity On Campus once (you type, not the app)
//   npx electron electron/spike.cjs --views 4 --overlay --hide-ui [--ua-chrome] [--no-handoff]
// The views open on blank marker pages; scripts/spike-electron.ts attaches over the local debugging
// port and tunes them with the same code the Chrome app uses. No DRM or login is bypassed.
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, components, session } = require('electron');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const VIEWS = Math.max(1, Math.min(6, Number(value('views', '1'))));
const PARTITION = 'persist:xfinity';

app.setName('TappedIn');
app.setPath('userData', path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'TappedIn', 'electron'));
app.commandLine.appendSwitch('remote-debugging-port', value('port', '9335'));
app.commandLine.appendSwitch('remote-allow-origins', 'http://127.0.0.1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Windows may hand video straight to a display-hardware plane, which ordinary screen captures show as black.
if (flag('no-dc-overlays')) app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
// Decode on the CPU instead of the GPU's video engine (which may only present a few streams at once).
if (flag('sw-decode')) app.commandLine.appendSwitch('disable-accelerated-video-decode');
// Diagnostics: --switch <chromium-switch>[=value] (repeatable).
args.forEach((a, i) => {
  if (a !== '--switch' || !args[i + 1]) return;
  const [k, v] = args[i + 1].split('=');
  app.commandLine.appendSwitch(k, v);
});

// Hides Xfinity's own interface and lets the <video> fill the view. Visibility is inherited through
// shadow DOM, so hiding the document and re-showing the video works even inside Xfinity's components.
const HIDE_JS = `(() => {
  if (window.__rzHide) return; window.__rzHide = true;
  const style = document.createElement('style');
  style.textContent = 'html,body{background:#000!important;cursor:none!important;overflow:hidden!important} html{visibility:hidden!important}';
  document.documentElement.appendChild(style);
  const show = () => {
    const vids = []; const walk = (r) => { for (const v of r.querySelectorAll('video')) vids.push(v); for (const el of r.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); }; walk(document);
    const v = vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (v) { v.style.setProperty('visibility', 'visible', 'important'); v.style.setProperty('object-fit', 'contain', 'important'); }
  };
  show(); setInterval(show, 1000);
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let handingOff = false; // the sign-in windows close before the main window opens: don't quit then
const CLICK_WATCH_NOW = `(() => {
  const el = document.querySelector('a.watch-now-btn') || [...document.querySelectorAll('a,button,[role=button]')].find((e) => /watch now/i.test(e.textContent || ''));
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
})()`;

// Xfinity Stream's own session cookies don't survive a restart; the Xfinity On Campus portal session does.
// Clicking the portal's "Watch Now" (exactly what you'd click) hands it to Xfinity Stream again. Nothing is
// typed: if the portal itself wants a sign-in, the window stays open for you.
async function handoff() {
  handingOff = true;
  const w = new BrowserWindow({ width: 1100, height: 760, title: 'TappedIn sign-in', webPreferences: { partition: PARTITION } });
  const stream = new Promise((resolve) => {
    const watch = (wc) => wc.on('did-finish-load', () => {
      if (/xfinity\.com\/stream(\/|$|\?)/.test(wc.getURL())) resolve(wc);
    });
    app.on('web-contents-created', (_e, wc) => watch(wc));
    watch(w.webContents);
  });
  await w.loadURL('https://www.xfinityoncampus.com/');
  let clicked = false;
  for (let i = 0; i < 30 && !clicked; i++) {
    clicked = await w.webContents.executeJavaScript(CLICK_WATCH_NOW).catch(() => false);
    if (!clicked) await sleep(500);
  }
  console.log(clicked ? '[spike] clicked Watch Now on Xfinity On Campus' : '[spike] no Watch Now button: sign in to Xfinity On Campus in the "TappedIn sign-in" window and click Watch Now');
  const wc = await Promise.race([stream, sleep(clicked ? 60_000 : 300_000).then(() => null)]);
  if (!wc) throw new Error('Xfinity Stream never opened after Watch Now');
  await sleep(6000); // let Xfinity Stream finish setting its session
  const signedIn = await wc.executeJavaScript(`!/\\bSign In\\b/.test(document.body.innerText.slice(0, 4000))`).catch(() => null);
  console.log(`[spike] Xfinity Stream opened: ${wc.getURL()} signed in: ${signedIn}`);
  for (const bw of BrowserWindow.getAllWindows()) if (bw.title !== 'TappedIn spike') bw.destroy();
  if (!w.isDestroyed()) w.destroy();
}

function grid(win) {
  const [w, h] = win.getContentSize();
  const cols = VIEWS <= 4 ? 2 : 3;
  const rows = 2;
  const cw = Math.floor(w / cols), ch = Math.floor(h / rows);
  return Array.from({ length: VIEWS }, (_, i) => ({ x: (i % cols) * cw + 1, y: Math.floor(i / cols) * ch + 1, width: cw - 2, height: ch - 2 }));
}

app.whenReady().then(async () => {
  const t0 = Date.now();
  await components.whenReady();
  console.log(`[spike] Widevine component ready in ${Date.now() - t0} ms:`, JSON.stringify(components.status()));
  const ses = session.fromPartition(PARTITION);
  if (flag('ua-chrome')) {
    // Xfinity sends Electron's identifier to an "Update your browser" page; present the matching Chrome one.
    // Set for the session AND as the app-wide fallback so the Watch Now popup gets it too.
    const ua = ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ TappedIn\/\S+/, '');
    app.userAgentFallback = ua;
    ses.setUserAgent(ua);
    console.log('[spike] user agent:', ua);
  } else console.log('[spike] user agent:', ses.getUserAgent());

  if (flag('login')) {
    const lw = new BrowserWindow({ width: 1536, height: 900, title: 'TappedIn sign-in', webPreferences: { partition: PARTITION } });
    await lw.loadURL(value('url', 'https://www.xfinityoncampus.com/login'));
    console.log('[spike] sign in to Xfinity On Campus if asked, click Watch Now, wait until Xfinity Stream shows your signed-in home page (not "Sign In"), then close every TappedIn window.');
    return;
  }
  if (!flag('no-handoff')) await handoff();

  const win = new BrowserWindow({ width: 1536, height: 900, backgroundColor: '#05070a', title: 'TappedIn spike', webPreferences: { partition: PARTITION } });
  handingOff = false;
  win.maximize();

  const views = [];
  for (let i = 0; i < VIEWS; i++) {
    const v = new WebContentsView({ webPreferences: { partition: PARTITION, backgroundThrottling: false } });
    v.setBackgroundColor('#000000');
    win.contentView.addChildView(v);
    views.push(v);
    const label = `RZ-SPIKE-${i + 1}`;
    await v.webContents.loadURL(`data:text/html,${encodeURIComponent(`<title>${label}</title><body style="background:#111;color:#888;font:20px system-ui;display:grid;place-items:center;height:100vh;margin:0">${label}</body>`)}`);
    if (flag('hide-ui')) {
      const apply = () => v.webContents.executeJavaScript(HIDE_JS).catch(() => {});
      v.webContents.on('did-finish-load', apply);
      v.webContents.on('did-navigate-in-page', apply);
    }
    v.webContents.setAudioMuted(i !== 0);
  }

  let overlay = null;
  if (flag('overlay')) {
    overlay = new WebContentsView({ webPreferences: { transparent: true } });
    overlay.setBackgroundColor('#00000000');
    win.contentView.addChildView(overlay); // added last = on top
    await overlay.webContents.loadURL(`data:text/html,${encodeURIComponent(`<title>RZ-OVERLAY</title><style>html,body{margin:0;background:transparent;height:100vh;overflow:hidden;font:700 14px system-ui}
      .b{position:absolute;color:#fff;background:rgba(220,38,38,.85);padding:6px 10px;border-radius:6px}</style><body>
      ${[0, 1, 2, 3].map((i) => `<div class="b" style="left:${i % 2 ? 51 : 1}%;top:${i < 2 ? 1 : 51}%">OVERLAY ${i + 1} over video</div>`).join('')}</body>`)}`);
  }

  const layout = () => {
    grid(win).forEach((b, i) => views[i].setBounds(b));
    if (overlay) {
      const [w, h] = win.getContentSize();
      overlay.setBounds({ x: 0, y: 0, width: w, height: h });
    }
  };
  win.on('resize', layout);
  layout();
  console.log(`[spike] ${VIEWS} view(s) ready${overlay ? ' + overlay' : ''}; attach with scripts/spike-electron.ts`);
});

app.on('window-all-closed', () => {
  if (!handingOff) app.quit();
});
