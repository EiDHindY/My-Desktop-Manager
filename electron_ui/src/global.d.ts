export interface IElectronAPI {
  executeCommand: (command: string) => Promise<{ ok: boolean, stdout: string, stderr: string }>;
  readJSON: (filename: string) => Promise<any>;
  writeJSON: (filename: string, data: any) => Promise<boolean>;
  moveDesktop: (fullId: string, targetFolder: string, targetIndex: number) => Promise<boolean>;
  fetchDesktops: (force?: boolean) => Promise<any>;
  listTemplates: () => Promise<any[]>;
  fetchChromeProfiles: () => Promise<any[]>;
  listIcons: () => Promise<string[]>;
  nativeAction: (action: string, params?: any) => Promise<any>;
  onDesktopsUpdated: (callback: (info: any) => void) => void;
  registerShortcuts: (shortcuts: { uuid: string; shortcut: string }[]) => Promise<string[]>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
