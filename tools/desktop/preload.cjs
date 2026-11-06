const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('leylineDesktop', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: content => ipcRenderer.invoke('project:save', content),
});
