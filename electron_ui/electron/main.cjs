const { app, BrowserWindow, ipcMain, Menu, protocol, globalShortcut } = require('electron');
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
  // Register custom protocol for local icons
  try {
    protocol.registerFileProtocol('local-icon', (request, callback) => {
      const url = decodeURIComponent(request.url.replace('local-icon://', ''));
      const appPath = app.getAppPath();
      const iconsDir = path.join(appPath, '..', 'icons');
      return callback(path.join(iconsDir, url));
    });
  } catch (error) {
    console.error('Failed to register protocol', error);
  }
  
  // Removes default menu to free up Ctrl+Q for React
  Menu.setApplicationMenu(null);

  createWindow();
});



  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
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

// Manage global shortcuts for desktops
ipcMain.handle('register-shortcuts', (event, shortcuts) => {
  globalShortcut.unregisterAll(); // Clear previous shortcuts
  
  if (!shortcuts || !Array.isArray(shortcuts)) return [];
  
  const failures = [];
  
  shortcuts.forEach(({ shortcut, uuid }) => {
    if (shortcut && uuid) {
      try {
        const success = globalShortcut.register(shortcut, () => {
          exec(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${uuid}"`);
        });
        if (!success) {
          failures.push(uuid);
          console.warn(`Failed to register shortcut ${shortcut} for desktop ${uuid}`);
        }
      } catch (err) {
        console.error(`Failed to register shortcut ${shortcut}:`, err);
        failures.push(uuid);
      }
    }
  });
  return failures;
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
    console.log("QDBUS DESKTOPS OUTPUT:", output);

    // Load labels.json cache for persistent names
    const labelsPath = path.join(os.homedir(), '.config', 'desktop-manager', 'labels.json');
    let labelCache = {};
    try {
      const labelsData = await fs.readFile(labelsPath, 'utf-8');
      labelCache = JSON.parse(labelsData);
    } catch (e) {}

    // ─── IMPROVED WINDOW DETECTION (WAYLAND NATIVE) ───
    const windowCountsByUuid = {};
    const appIconsByUuid = {};

    try {
      const searchRes = await execAsync("kdotool search --class '.*' 2>/dev/null");
      const windowIds = searchRes.stdout.split('\n').filter(id => id.trim().length > 0);

      const windowInfos = await Promise.all(
        windowIds.map(async (id) => {
          try {
            const infoRes = await execAsync(`qdbus-qt6 --literal org.kde.KWin /KWin org.kde.KWin.getWindowInfo "${id}"`);
            const info = infoRes.stdout;

            const typeMatch = info.match(/"type" = \[Variant\(int\): (\d+)\]/);
            const skipTaskbarMatch = info.match(/"skipTaskbar" = \[Variant\(bool\): (true|false)\]/);
            
            if (typeMatch && typeMatch[1] === '0' && skipTaskbarMatch && skipTaskbarMatch[1] === 'false') {
              const classMatch = info.match(/"resourceClass" = \[Variant\(QString\): "([^"]+)"\]/);
              const desktopsMatch = info.match(/"desktops" = \[Variant\(QStringList\): \{([^}]*)\}\]/);

              if (classMatch) {
                const wclass = classMatch[1];
                const desktopUuids = desktopsMatch && desktopsMatch[1] 
                  ? desktopsMatch[1].split(',').map(u => u.trim().replace(/"/g, '')) 
                  : [];
                
                return { wclass, desktopUuids };
              }
            }
          } catch (e) {}
          return null;
        })
      );

      windowInfos.forEach(info => {
        if (!info) return;
        info.desktopUuids.forEach(uuid => {
          windowCountsByUuid[uuid] = (windowCountsByUuid[uuid] || 0) + 1;
          if (!appIconsByUuid[uuid]) appIconsByUuid[uuid] = [];
          if (!appIconsByUuid[uuid].includes(info.wclass)) {
            appIconsByUuid[uuid].push(info.wclass);
          }
        });
      });
    } catch (e) {
      console.error("Window detection failed:", e);
    }

    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops = {};
    const priorities = {};
    const counts = {};
    const appMap = {};
    let cacheUpdated = false;

    const desktopIcons = {};
    const desktopShortcuts = {};
    while ((match = regex.exec(output)) !== null) {
      const pos = parseInt(match[1]);
      const uuid = match[2];
      let name = match[3];
      let priority = "None";

      const isNameEmpty = !name || name === "" || name.toLowerCase() === "empty" || name.toLowerCase().startsWith("desktop ");
      
      let cached = labelCache[uuid];
      if (typeof cached === 'string') {
        cached = { name: cached, priority: "None" };
        labelCache[uuid] = cached;
        cacheUpdated = true;
      }

      if (isNameEmpty && cached) {
        name = cached.name;
        priority = cached.priority || "None";
        exec(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "${name.replace(/"/g, '\\"')}"`);
      } else if (!isNameEmpty) {
        if (cached) {
          priority = cached.priority || "None";
          if (name !== cached.name) {
            cached.name = name;
            cacheUpdated = true;
          }
        } else {
          labelCache[uuid] = { name, priority: "None" };
          cacheUpdated = true;
        }
      }

      // Migrate legacy single icon to icons array
      if (cached && cached.icon && !cached.icons) {
        cached.icons = [cached.icon];
        delete cached.icon;
        cacheUpdated = true;
      }

      desktops[uuid] = name;
      priorities[uuid] = priority;
      counts[uuid] = windowCountsByUuid[uuid] || 0;
      appMap[uuid] = appIconsByUuid[uuid] || [];
      desktopIcons[uuid] = (cached && cached.icons) ? cached.icons : [];
      desktopShortcuts[uuid] = (cached && cached.shortcut) ? cached.shortcut : null;
    }

    if (cacheUpdated) {
      await fs.writeFile(labelsPath, JSON.stringify(labelCache, null, 2));
    }
    
    return { 
      names: desktops, 
      priorities: priorities, 
      counts: counts, 
      apps: appMap, 
      icons: desktopIcons, 
      shortcuts: desktopShortcuts,
      current: currentOutput 
    };
  } catch (error) {
    console.error('Error fetching desktops:', error);
    return { names: {}, priorities: {}, counts: {}, apps: {}, current: null };
  }
});

ipcMain.handle('list-icons', async () => {
  const appPath = app.getAppPath();
  const iconsDir = path.join(appPath, '..', 'icons');
  console.log('[ICONS] Searching in:', iconsDir);
  try {
    if (!fsSync.existsSync(iconsDir)) {
      console.error('[ICONS] Directory does NOT exist:', iconsDir);
      return [];
    }
    const files = await fs.readdir(iconsDir);
    console.log('[ICONS] Found files:', files);
    const filtered = files.filter(f => f.match(/\.(png|jpe?g|svg|webp)$/i));
    console.log('[ICONS] Filtered icons:', filtered);
    return filtered;
  } catch (error) {
    console.error('[ICONS] Error reading icons:', error);
    return [];
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
