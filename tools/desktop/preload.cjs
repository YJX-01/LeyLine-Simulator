const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('leylineDesktop', {
  lookupEnka: uid => ipcRenderer.invoke('account:enka', uid),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: content => ipcRenderer.invoke('project:save', content),
});
