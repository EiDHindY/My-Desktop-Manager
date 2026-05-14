const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// ─── APP NAME & ICON ───
app.setName('Desktop Manager');
const ICON_PATH = path.join(__dirname, 'icon.png');

// ─── PID FILE PATH ───
const PID_FILE = '/tmp/desktop-manager.pid';

// Helper: show and focus the window (used by both SIGUSR1 and globalShortcut)
function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  app.focus({ steal: true });
}

// ─── SIGUSR2: Fired by KDE Custom Shortcut — zero latency, compositor-native ──
// NOTE: SIGUSR1 is reserved by Node.js for the debugger, so we use SIGUSR2.
process.on('SIGUSR2', () => {
  console.log('[SIGNAL] SIGUSR2 received — showing window');
  showWindow();
});

// SAFE MODE: Disable GPU to prevent crashes on Fedora/KDE
app.disableHardwareAcceleration(); 

// PERFORMANCE BOOSTERS
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  // We are the primary instance. Write our PID for the KDE Custom Shortcut.
  fsSync.writeFileSync(PID_FILE, process.pid.toString());

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    frame: false,
    transparent: false, // Solid background for visibility
    backgroundColor: '#1a1b26', // Matching your theme
    alwaysOnTop: true,
    title: "Desktop Manager", // Explicit title for wmctrl
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.center();

  // Check if we are running in dev mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.show();
  mainWindow.focus();

  // Set behaviors AFTER show() so KDE registers the window properly
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'floating');

}

app.whenReady().then(() => {
  // Removes default menu to free up Ctrl+Q for React
  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  try { fsSync.unlinkSync(PID_FILE); } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Listen for messages from the React UI to execute commands
// Using ipcMain.handle so the renderer can await completion before refreshing data
ipcMain.handle('execute-command', async (event, command) => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) console.error(`Error: ${error.message}`);
      resolve({ ok: !error, stdout, stderr });
    });
  });
});

// Provide data to the React UI (ASYNCHRONOUS)
ipcMain.handle('read-json', async (event, filename) => {
  const filePath = path.join(os.homedir(), '.config', 'desktop-manager', filename);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
});

ipcMain.handle('fetch-desktops', async () => {
  try {
    // Run current desktop and desktop list in parallel
    const [currentRes, desktopsRes] = await Promise.all([
      execAsync('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current'),
      execAsync('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops'),
    ]);

    const currentOutput = currentRes.stdout.trim();
    const output = desktopsRes.stdout;

    // Use kdotool to count windows per desktop (Wayland compatible)
    // Filter out system windows (Plasma panel, Desktop Manager, empty titles) that appear on all workspaces
    // kdotool get_desktop_for_window returns 1-based desktop numbers
    // qdbus pos is 0-based, so we do pos+1 when looking up counts
    let windowCountsByPos = {};
    try {
      const kdotoolRes = await execAsync(
        `for id in $(kdotool search --class '.*' 2>/dev/null); do` +
        `  wname=$(kdotool getwindowname "$id" 2>/dev/null);` +
        `  wclass=$(kdotool getwindowclass "$id" 2>/dev/null);` +
        `  if [[ "$wclass" == *"desktop-manager"* ]] || ` +
        `     [[ "$wname" == "Menu" ]] || ` +
        `     [[ "$wname" == "plasmashell" ]] || ` +
        `     [[ "$wname" == "Xwayland Video Bridge" ]] || ` +
        `     [[ "$wname" == "Wayland to X Recording bridge"* ]] || ` +
        `     [[ "$wname" == "" ]]; then` +
        `    : ;` + // Ignore these
        `  else` +
        `    kdotool get_desktop_for_window "$id" 2>/dev/null;` +
        `  fi;` +
        `done`
      );
      kdotoolRes.stdout.split('\n').forEach(line => {
        const idx = parseInt(line.trim());
        if (!isNaN(idx) && idx > 0) {
          windowCountsByPos[idx] = (windowCountsByPos[idx] || 0) + 1;
        }
      });
    } catch (e) {
      // kdotool not available — all counts stay 0
    }

    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops = {};
    const counts = {};
    while ((match = regex.exec(output)) !== null) {
      const pos = parseInt(match[1]); // 0-based from qdbus
      const uuid = match[2];
      desktops[uuid] = match[3];
      counts[uuid] = windowCountsByPos[pos + 1] || 0; // +1 to convert to kdotool's 1-based
    }
    
    return { names: desktops, counts: counts, current: currentOutput };
  } catch (error) {
    console.error('Error fetching desktops:', error);
    return { names: {}, counts: {}, current: null };
  }
});

ipcMain.handle('list-templates', async () => {
  const templatesDir = path.join(os.homedir(), '.config', 'desktop-manager', 'templates');
  try {
    const files = await fs.readdir(templatesDir);
    const templates = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(templatesDir, file), 'utf-8');
          const data = JSON.parse(content);
          templates.push({
            name: file.replace('.json', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            filename: file,
            tasks: data.tasks || []
          });
        } catch (e) {
          // Skip unparseable files
        }
      }
    }
    return templates;
  } catch (error) {
    return [];
  }
});

ipcMain.handle('write-json', async (event, filename, data) => {
  const filePath = path.join(os.homedir(), '.config', 'desktop-manager', filename);
  const tempPath = filePath + '.tmp.' + Date.now() + '-' + Math.random().toString(36).substring(2);
  try {
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, filePath);
    return true;
  } catch (error) {
    try { await fs.unlink(tempPath); } catch (e) {}
    return false;
  }
});

ipcMain.handle('move-desktop', async (event, fullId, targetFolder, targetIndex) => {
  const sessionPath = path.join(os.homedir(), '.config', 'desktop-manager', 'session.json');
  const tempPath = sessionPath + '.tmp.' + Date.now() + '-' + Math.random().toString(36).substring(2);
  try {
    const raw = await fs.readFile(sessionPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.folders) {
      for (const f of Object.keys(data.folders)) {
        data.folders[f] = data.folders[f].filter(id => id !== fullId);
      }
      if (!data.folders[targetFolder]) data.folders[targetFolder] = [];
      data.folders[targetFolder].splice(targetIndex, 0, fullId);
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, sessionPath);
      return true;
    }
    return false;
  } catch (error) {
    try { await fs.unlink(tempPath); } catch (e) {}
    return false;
  }
});

ipcMain.handle('fetch-chrome-profiles', async () => {
  const localStatePath = path.join(os.homedir(), '.config', 'google-chrome', 'Local State');
  try {
    const raw = await fs.readFile(localStatePath, 'utf-8');
    const data = JSON.parse(raw);
    const infoCache = data.profile?.info_cache || {};
    
    return Object.entries(infoCache)
      .filter(([dir]) => dir !== 'System Profile')
      .map(([dir, info]) => ({
        id: dir,
        name: info.name,
        email: info.user_name || '',
        avatar: info.last_downloaded_gaia_picture_url_with_size || ''
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    return [];
  }
});

const { dialog } = require('electron');

ipcMain.handle('native-action', async (event, action, params) => {
  if (action === 'select-folder') {
    try {
      // Use PyQt5 to get the exact same dialog behavior as the old python UI
      const pyScript = `
import sys
import os
from PyQt5.QtWidgets import QApplication, QFileDialog

app = QApplication(sys.argv)
default_dir = os.path.expanduser("~/.local/bin/Scripts")
folder_path = QFileDialog.getExistingDirectory(None, "Select Folder to Import", default_dir)
if folder_path:
    print(folder_path)
`;
      const tempPath = path.join(os.tmpdir(), 'desktop_manager_select.py');
      await fs.writeFile(tempPath, pyScript);
      const { stdout } = await execAsync(`python3 "${tempPath}"`);
      return stdout && stdout.trim() !== '' ? stdout.trim() : null;
    } catch (e) {
      console.error('File dialog error:', e);
      return null;
    }
  }

  if (action === 'select-file') {
    try {
      // Use PyQt5 to get the exact same dialog behavior as the old python UI
      const pyScript = `
import sys
import os
from PyQt5.QtWidgets import QApplication, QFileDialog

app = QApplication(sys.argv)
default_dir = os.path.expanduser("~/.local/bin/Scripts")
file_path, _ = QFileDialog.getOpenFileName(None, "Select Script to Import", default_dir, "Scripts (*.sh);;All Files (*)")
if file_path:
    print(file_path)
`;
      const tempPath = path.join(os.tmpdir(), 'desktop_manager_select_file.py');
      await fs.writeFile(tempPath, pyScript);
      const { stdout } = await execAsync(`python3 "${tempPath}"`);
      return stdout && stdout.trim() !== '' ? stdout.trim() : null;
    } catch (e) {
      console.error('File dialog error:', e);
      return null;
    }
  }

  return null;
});
