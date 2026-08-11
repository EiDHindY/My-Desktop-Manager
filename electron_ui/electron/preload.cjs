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
  hideCompactSwitcher: () => ipcRenderer.invoke('hide-compact-switcher'),
  restartScrollDaemon: () => ipcRenderer.invoke('restart-scroll-daemon'),
  nativeAction: (action, params) => ipcRenderer.invoke('native-action', action, params),
  registerShortcuts: (shortcuts) => ipcRenderer.invoke('register-shortcuts', shortcuts),
  togglePinDesktop: (uuid) => ipcRenderer.invoke('toggle-pin-desktop', uuid),
  onDesktopsUpdated: (callback) => {
    ipcRenderer.removeAllListeners('desktops-updated'); // prevent duplicate listeners
    ipcRenderer.on('desktops-updated', (_event, data) => callback(data));
  },
  onPinStatusChanged: (callback) => {
    ipcRenderer.removeAllListeners('pin-status-changed');
    ipcRenderer.on('pin-status-changed', (_event, isAlwaysOnTop) => callback(isAlwaysOnTop));
  },
  onCompactScroll: (callback) => {
    ipcRenderer.removeAllListeners('compact-scroll');
    ipcRenderer.on('compact-scroll', (_event, direction) => callback(direction));
  },
  onCompactConfirm: (callback) => {
    ipcRenderer.removeAllListeners('compact-confirm');
    ipcRenderer.on('compact-confirm', () => callback());
  },
  onCompactReset: (callback) => {
    ipcRenderer.removeAllListeners('compact-reset');
    ipcRenderer.on('compact-reset', () => callback());
  },
  onMessage: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('radial-scroll', handler);
    ipcRenderer.on('radial-show', handler);
    return () => {
      ipcRenderer.removeListener('radial-scroll', handler);
      ipcRenderer.removeListener('radial-show', handler);
    };
  }
});
