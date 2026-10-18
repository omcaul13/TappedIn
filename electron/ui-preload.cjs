// The UI page's only window into the shell: fullscreen. Everything else goes through the app's
// local API (http://localhost:7480).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rzShell', {
  toggleFullscreen: () => ipcRenderer.invoke('rz:toggle-fullscreen'),
  onFullscreen: (cb) => ipcRenderer.on('rz:fullscreen', (_e, on) => cb(Boolean(on))),
});
