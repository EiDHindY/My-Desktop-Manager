export interface IElectronAPI {
  executeCommand: (command: string) => Promise<{ ok: boolean, stdout: string, stderr: string }>;
  readJSON: (filename: string) => Promise<any>;
  writeJSON: (filename: string, data: any) => Promise<boolean>;
  moveDesktop: (fullId: string, targetFolder: string, targetIndex: number) => Promise<boolean>;
  fetchDesktops: (force?: boolean) => Promise<any>;
  listTemplates: () => Promise<any[]>;
  fetchChromeProfiles: () => Promise<any[]>;
  listIcons: () => Promise<string[]>;
  hideCompactSwitcher: () => Promise<void>;
  restartScrollDaemon: () => Promise<void>;
  nativeAction: (action: string, params?: any) => Promise<any>;
  onCompactScroll: (callback: (direction: number) => void) => void;
  onCompactConfirm: (callback: () => void) => void;
  onCompactReset: (callback: () => void) => void;
  onDesktopsUpdated: (callback: (info: any) => void) => void;
  registerShortcuts: (shortcuts: { uuid: string; shortcut: string }[]) => Promise<string[]>;
  togglePinDesktop: (uuid: string) => Promise<void>;
  popoutNote: (noteId: string) => Promise<boolean>;
  closePopout: (noteId: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
