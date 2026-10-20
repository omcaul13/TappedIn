// The UI page's only window into the shell: fullscreen, and the Mac menu's Settings… item. Everything
// else goes through the app's local API (http://localhost:7480).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rzShell', {
  toggleFullscreen: () => ipcRenderer.invoke('rz:toggle-fullscreen'),
  onFullscreen: (cb) => ipcRenderer.on('rz:fullscreen', (_e, on) => cb(Boolean(on))),
  onOpenSettings: (cb) => ipcRenderer.on('rz:open-settings', () => cb()),
});
