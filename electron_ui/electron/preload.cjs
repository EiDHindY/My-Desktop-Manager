const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  readJSON: (filename) => ipcRenderer.invoke('read-json', filename),
  writeJSON: (filename, data) => ipcRenderer.invoke('write-json', filename, data),
  moveDesktop: (fullId, targetFolder, targetIndex) => ipcRenderer.invoke('move-desktop', fullId, targetFolder, targetIndex),
  fetchDesktops: (scanWindows) => ipcRenderer.invoke('fetch-desktops', scanWindows),
  listTemplates: () => ipcRenderer.invoke('list-templates'),
  fetchChromeProfiles: () => ipcRenderer.invoke('fetch-chrome-profiles'),
  listIcons: () => ipcRenderer.invoke('list-icons'),
  nativeAction: (action, params) => ipcRenderer.invoke('native-action', action, params),
  registerShortcuts: (shortcuts) => ipcRenderer.invoke('register-shortcuts', shortcuts),
  onDesktopsUpdated: (callback) => {
    ipcRenderer.removeAllListeners('desktops-updated'); // prevent duplicate listeners
    ipcRenderer.on('desktops-updated', (_event, data) => callback(data));
  }
});
