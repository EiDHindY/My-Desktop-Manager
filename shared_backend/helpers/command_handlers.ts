import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync, accessSync, constants, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { execSync } from 'child_process';
import { runCommand, launchAppsForDesktop, closeWindowsOnDesktop } from './kwin_utils';
import { Desktop } from './desktop_utils';
import { updateLabel, removeLabel, updateIcon, updateShortcut } from './label_cache';

export function handleClear(result: string, sessionPath: string, desktopMap: Map<string, string>, undoStack: any[], currentDesktops: Desktop[] = []) {
    const logPath = join(process.env.HOME || '', '.config', 'desktop-manager', 'debug.log');
    const log = (msg: string) => {
        try {
            const time = new Date().toISOString();
            // console.log(`[${time}] ${msg}`);
            // appendFileSync(logPath, `[${time}] ${msg}\n`);
        } catch (e) {}
    };

    log(`handleClear started with: ${result}`);
    const rawOutput = result.substring(6);
    const parts = rawOutput.split("___");
    const id = parts[0];
    
    // Improved kwinIdx lookup:
    let kwinIdx = parts.length > 1 ? parts[1] : null;
    
    // If not in the command string, find it from currentDesktops by UUID
    if (!kwinIdx || isNaN(parseInt(kwinIdx))) {
        const d = currentDesktops.find(desk => desk.uuid === id);
        if (d) {
            kwinIdx = d.position.toString();
            log(`Resolved kwinIdx from UUID ${id} -> ${kwinIdx}`);
        } else {
            log(`Could not resolve kwinIdx for UUID ${id}`);
        }
    }
    
    log(`Parsed: id=${id}, kwinIdx=${kwinIdx}, rawOutput=${rawOutput}`);
    
    undoStack.push({ id, oldName: desktopMap.get(rawOutput) || "" });
    
    try {
        // 1. Remove label from cache FIRST to prevent restoration logic in fetchDesktops from kicking in
        log(`Removing label for ${id}`);
        removeLabel(id);

        // 2. Update session.json for immediate persistence
        if (existsSync(sessionPath)) {
            log(`Updating session.json at ${sessionPath}`);
            const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
            if (data.folders) {
                for (const f of Object.keys(data.folders)) {
                    const originalLen = data.folders[f].length;
                    // Filter by UUID part instead of full string
                    data.folders[f] = data.folders[f].filter((i: string) => i.split("___")[0] !== id);
                    if (data.folders[f].length !== originalLen) {
                        log(`Removed ${id} from folder ${f}`);
                    }
                }
            }
            if (data.desktop_notes) {
                if (data.desktop_notes[id]) {
                    delete data.desktop_notes[id];
                    log(`Deleted notes for ${id}`);
                }
            }
            writeFileSync(sessionPath, JSON.stringify(data, null, 2));
            log(`Successfully wrote session.json`);
        }

        // 3. Perform rename
        log(`Running qdbus rename command for ${id}`);
        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${id}" "Empty"`);
        
        // 4. Kill windows in background
        if (kwinIdx !== null) {
            log(`Triggering window closing on desktop ${kwinIdx} (0-based) in background`);
            // cli.ts now handles the 0->1 conversion
            runCommand(`(npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" CLOSE_WINDOWS:${kwinIdx} && notify-send "Desktop Manager" "✅ Desktop ${id.substring(0,8)} cleaned up") &`);
        } else {
            runCommand(`notify-send "Desktop Manager" "✅ Desktop ${id.substring(0,8)} removed from list"`);
        }
    } catch (e: any) {
        log(`ERROR in handleClear: ${e.message}\n${e.stack}`);
        runCommand(`notify-send "Desktop Manager" "❌ Deletion failed: ${e.message}"`);
    }
}

export function handleSummonFolder(folderName: string, sessionPath: string) {
    try {
        if (!existsSync(sessionPath)) return;
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const uids: string[] = data.folders?.[folderName] || [];
        
        if (uids.length === 0) {
            runCommand(`notify-send "Desktop Manager" "Folder '${folderName}' is empty."`);
            return;
        }
        
        runCommand(`notify-send "Desktop Manager" "🚀 Sequencing '${folderName}'..."`);
        
        // 1. Find indices of desktops that HAVE windows to avoid redundant launches
        const cmd = "for id in $(kdotool search --class '.*' 2>/dev/null); do wname=$(kdotool getwindowname $id 2>/dev/null); if [[ \"$wname\" != \"Desktop Manager UI\" ]] && [[ \"$wname\" != \"Menu\" && \"$wname\" != \"\" ]]; then kdotool get_desktop_for_window $id 2>/dev/null; fi; done 2>/dev/null | sort -u";
        const activeStr = runCommand(cmd) || "";
        const activeIndices = activeStr.split("\n").map(s => s.trim()).filter(s => s !== "").map(s => parseInt(s));

        for (let i = 0; i < uids.length; i++) {
            const fullId = uids[i];
            const parts = fullId.split("___");
            const uuid = parts[0];
            const position = parts.length > 1 ? parseInt(parts[1]) : -1;
            
            if (uuid) {
                console.log(`Summoning ${uuid} (Desktop ${i+1}/${uids.length})`);
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${uuid}"`);
                
                // If desktop already has windows, skip launching apps to avoid duplicates
                if (position >= 0 && activeIndices.includes(position + 1)) {
                    console.log(`Desktop ${uuid} already has windows, skipping app launch.`);
                } else {
                    launchAppsForDesktop(uuid, true);
                }
                
                // Wait 1.5 seconds before the next one, unless it's the last one
                if (i < uids.length - 1) {
                    execSync('sleep 1.5');
                }
            }
        }
    } catch (e) {
        console.error("Error in handleSummonFolder:", e);
    }
}

export function handleDeploy(result: string, sessionPath: string, currentDesktops: Desktop[], currentUuid: string) {
    let type: 'ALL' | 'SELECTED' | 'TASK' | null = null;
    if (result.startsWith('DEPLOY_SELECTED:')) type = 'SELECTED';
    else if (result.startsWith('DEPLOY_TASK:')) type = 'TASK';
    else if (result.startsWith('DEPLOY_ALL:')) type = 'ALL';

    if (!type) return;

    // Correct substring indices based on command prefix length
    const prefixLen = type === 'SELECTED' ? 16 : (type === 'TASK' ? 12 : 11);
    const dataStr = result.substring(prefixLen);
    
    let folderName = "";
    let selectedIds: string[] = [];

    if (type === 'ALL') {
        folderName = dataStr.trim();
    } else {
        const parts = dataStr.split(':');
        folderName = parts[0].trim();
        // The rest of the string after the first colon is the task identifier(s)
        selectedIds = parts.slice(1).join(':').split('|');
    }

    const libraryDir = join(process.env.HOME || '', '.config', 'desktop-manager');
    const templatesDir = join(libraryDir, 'templates');
    
    try {
        const filename = folderName.toLowerCase().replace(/\s+/g, '_') + '.json';
        const templatePath = join(templatesDir, filename);
        
        if (!existsSync(templatePath)) {
            return runCommand(`notify-send "Desktop Manager" "Error: Template file '${filename}' not found."`);
        }

        const templateData = JSON.parse(readFileSync(templatePath, 'utf-8'));
        let tasks = templateData.tasks || [];
        
        if (type === 'SELECTED') {
            tasks = tasks.filter((t: any) => selectedIds.includes(t.name));
        } else if (type === 'TASK') {
            tasks = tasks.filter((t: any) => selectedIds.includes(t.id));
        }

        const empties = currentDesktops.filter(d => {
            const isNameEmpty = ["", "empty"].includes(d.name.toLowerCase().trim()) || /^desktop \d+$/.test(d.name.toLowerCase());
            return isNameEmpty && d.uuid !== currentUuid;
        });

        if (empties.length < tasks.length) return runCommand(`kdialog --msgbox "Not enough empty desktops (excluding your current one)."`);
        
        let session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        if (!session.startup_apps) session.startup_apps = {};
        if (!session.folders) session.folders = {};
        if (!session.folders[folderName]) session.folders[folderName] = [];
        if (!session.folder_order.includes(folderName)) session.folder_order.push(folderName);

        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i], dest = empties[i];
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${dest.uuid}" "${t.name}"`);
            updateLabel(dest.uuid, t.name);
            
            const entry = `${dest.uuid}___${dest.position}`;
            for (const f of Object.keys(session.folders)) session.folders[f] = session.folders[f].filter((id: string) => id !== entry);
            
            // Safety check: only add if not already present (though filter above should handle it)
            if (!session.folders[folderName].includes(entry)) {
                session.folders[folderName].push(entry);
            }
            
            if (t.script) session.startup_apps[dest.uuid] = [t.script];
            
            // Handle multiple icons
            if (t.icons && Array.isArray(t.icons)) {
                updateIcon(dest.uuid, t.icons.join(','));
            } else if (t.icon) {
                updateIcon(dest.uuid, t.icon);
            }
            
            // Handle shortcut
            if (t.shortcut) {
                updateShortcut(dest.uuid, t.shortcut);
            }
        }
        writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        runCommand(`notify-send "Desktop Manager" "🚀 Deployed ${tasks.length} tasks to '${folderName}'"`);
    } catch (e) {
        console.error("Deploy error:", e);
    }
}

export function handleCreateTemplate(folderName: string) {
    try {
        const libraryDir = join(process.env.HOME || '', '.config', 'desktop-manager');
        const templatesDir = join(libraryDir, 'templates');
        if (!existsSync(templatesDir)) {
            mkdirSync(templatesDir, { recursive: true });
        }
        const filename = folderName.toLowerCase().replace(/\s+/g, '_') + '.json';
        const templatePath = join(templatesDir, filename);

        if (existsSync(templatePath)) {
            runCommand(`notify-send "Desktop Manager" "⚠️ Template '${folderName}' already exists."`);
            return;
        }

        const templateData = {
            name: folderName,
            tasks: []
        };

        writeFileSync(templatePath, JSON.stringify(templateData, null, 2));
        runCommand(`notify-send "Desktop Manager" "📁 Created new template '${folderName}'"`);
    } catch (e) {
        console.error("Create Template error:", e);
    }
}

export function handleCreateLiveDesktop(folderName: string, sessionPath: string, currentDesktops: Desktop[], currentUuid: string, providedName: string = "") {
    try {
        let name = providedName;
        
        if (!name) {
            // Correct path to rename-box.py in the python_ui directory
            const renamePy = join(__dirname, '..', '..', 'python_ui', 'rename-box.py');
            name = runCommand(`'${renamePy}' "New Desktop"`) || "";
        }
        
        if (!name) return;

        const empties = currentDesktops.filter(d => {
            const isNameEmpty = ["", "empty"].includes(d.name.toLowerCase().trim()) || /^desktop \d+$/.test(d.name.toLowerCase());
            return isNameEmpty && d.uuid !== currentUuid;
        });

        console.log(`Found ${empties.length} empty desktops.`);

        if (empties.length === 0) {
            runCommand(`kdialog --msgbox "No empty desktops available (excluding your current one)."`);
            return;
        }

        const dest = empties[0];
        console.log(`Targeting desktop: ${dest.uuid} (position ${dest.position})`);
        
        const [nameOnly] = name.split('|');
        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${dest.uuid}" "${nameOnly.replace(/"/g, '\\"')}"`);
        updateLabel(dest.uuid, name);
        name = nameOnly; // for the notification below

        let session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        if (!session.folders) session.folders = {};
        if (!session.folders[folderName]) session.folders[folderName] = [];
        
        const entry = `${dest.uuid}___${dest.position}`;
        for (const f of Object.keys(session.folders)) {
            session.folders[f] = session.folders[f].filter((id: string) => id !== entry);
        }
        session.folders[folderName].push(entry);

        console.log(`Saving session to ${sessionPath}...`);
        writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        runCommand(`notify-send "Desktop Manager" "➕ Created '${name}' in '${folderName}'"`);
    } catch (e) {
        console.error("Error in handleCreateLiveDesktop:", e);
    }
}

export function handleUngroupDesktop(result: string, sessionPath: string) {
    try {
        const parts = result.substring(16).split(':');
        if (parts.length < 2) return;
        const folderName = parts[0];
        const fullId = parts[1];

        if (existsSync(sessionPath)) {
            const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
            if (data.folders && data.folders[folderName]) {
                data.folders[folderName] = data.folders[folderName].filter((id: string) => id !== fullId);
                writeFileSync(sessionPath, JSON.stringify(data, null, 2));
                runCommand(`notify-send "Desktop Manager" "🔓 Removed from '${folderName}'"`);
            }
        }
    } catch (e) {}
}

export function handleRemoveLibraryFolder(folderName: string, templatesDir: string) {
    try {
        const libPath = join(templatesDir, '../library.json');
        if (existsSync(libPath)) {
            const data = JSON.parse(readFileSync(libPath, 'utf-8'));
            if (data.folders) delete data.folders[folderName];
            if (data.folder_order) data.folder_order = data.folder_order.filter((f: string) => f !== folderName);
            writeFileSync(libPath, JSON.stringify(data, null, 2));
        }
        
        const files = readdirSync(templatesDir);
        const searchName = folderName.toLowerCase().replace(/\s+/g, '_');
        for (const file of files) {
            if (file.toLowerCase().includes(searchName) && file.endsWith('.json')) {
                unlinkSync(join(templatesDir, file));
            }
        }
    } catch (e: any) {}
}

export function handleRemoveLiveFolder(folderName: string, sessionPath: string, keepFolder: boolean = false) {
    try {
        if (!existsSync(sessionPath)) return;
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const uids: string[] = data.folders?.[folderName] || [];

        for (const fullId of uids) {
            const parts = fullId.split("___");
            if (parts.length > 1) {
                const kwinIdx = (parseInt(parts[1]) + 1).toString();
                closeWindowsOnDesktop(kwinIdx);
            }
        }

        for (const fullId of uids) {
            const uuid = fullId.split("___")[0];
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "Empty"`);
            removeLabel(uuid);
            if (data.desktop_notes) delete data.desktop_notes[uuid];
            if (data.startup_apps) delete data.startup_apps[uuid];
        }

        if (!keepFolder) {
            if (data.folders) delete data.folders[folderName];
            if (data.folder_order) data.folder_order = data.folder_order.filter((f: string) => f !== folderName);
            runCommand(`notify-send "Desktop Manager" "🧹 Folder '${folderName}' cleared and removed."`);
        } else {
            // Keep folder but reset its desktops list if you want, 
            // though usually Wipe means clean the desktops but keep the assignment.
            // Let's keep the desktops assigned to the folder but they are now named "Empty".
            runCommand(`notify-send "Desktop Manager" "🧼 Folder '${folderName}' wiped clean (desktops kept)."`);
        }

        writeFileSync(sessionPath, JSON.stringify(data, null, 2));
    } catch (e) {}
}

export function handleCleanEmpty(currentDesktops: Desktop[], sessionPath: string) {
    // 1. Find indices of desktops that HAVE windows
    const cmd = "for id in $(kdotool search --class '.*' 2>/dev/null); do wname=$(kdotool getwindowname $id 2>/dev/null); if [[ \"$wname\" != \"Desktop Manager\" ]] && [[ \"$wname\" != \"Menu\" && \"$wname\" != \"\" ]]; then kdotool get_desktop_for_window $id 2>/dev/null; fi; done 2>/dev/null | sort -u";
    const activeStr = runCommand(cmd) || "";
    const activeIndices = activeStr.split("\n").map(s => s.trim()).filter(s => s !== "").map(s => parseInt(s));
    
    let cleanedCount = 0;
    try {
        let session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf-8')) : {};
        if (!session.folders) session.folders = {};
        if (!session.desktop_notes) session.desktop_notes = {};

        for (const d of currentDesktops) {
            // Note: WindowFetcher and label-desktop use 1-based index (position + 1) for kwinIdx
            const kwinIdx = d.position + 1;
            
            if (!activeIndices.includes(kwinIdx)) {
                // If the desktop is empty and NOT already named "Empty"
                if (d.name.toLowerCase() !== "empty") {
                    runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${d.uuid}" "Empty"`);
                    removeLabel(d.uuid);
                    cleanedCount++;
                    
                    // Remove from session folders to keep them clean
                    const fullId = `${d.uuid}___${d.position}`;
                    for (const f of Object.keys(session.folders)) {
                        session.folders[f] = session.folders[f].filter((id: string) => id !== fullId);
                    }
                    delete session.desktop_notes[d.uuid];
                    if (session.startup_apps) delete session.startup_apps[d.uuid];
                }
            }
        }
        
        if (cleanedCount > 0) {
            writeFileSync(sessionPath, JSON.stringify(session, null, 2));
            runCommand(`notify-send "Desktop Manager" "🧹 Cleaned ${cleanedCount} empty desktops."`);
        } else {
            runCommand(`notify-send "Desktop Manager" "✨ All empty desktops are already clean."`);
        }
    } catch (e) {
        console.error("Clean Empty error:", e);
    }
}

export function handleClearAll(currentDesktops: Desktop[], currentUuid: string, sessionPath: string) {
    let clearedCount = 0;
    try {
        let session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf-8')) : {};
        if (!session.folders) session.folders = {};
        if (!session.desktop_notes) session.desktop_notes = {};

        for (const d of currentDesktops) {
            if (d.uuid === currentUuid) continue;
            
            const kwinIdx = (d.position + 1).toString();
            closeWindowsOnDesktop(kwinIdx);
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${d.uuid}" "Empty"`);
            removeLabel(d.uuid);
            clearedCount++;
            
            // Clean from session
            const fullId = `${d.uuid}___${d.position}`;
            for (const f of Object.keys(session.folders)) {
                session.folders[f] = session.folders[f].filter((id: string) => id !== fullId);
            }
            delete session.desktop_notes[d.uuid];
            if (session.startup_apps) delete session.startup_apps[d.uuid];
        }
        
        writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        runCommand(`notify-send "Desktop Manager" "💥 Nuked ${clearedCount} desktops (kept current)."`);
    } catch (e) {
        console.error("Clear All error:", e);
    }
}

export function handleAddFolder(folderName: string, sessionPath: string) {
    try {
        let session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf-8')) : {};
        if (!session.folders) session.folders = {};
        if (!session.folder_order) session.folder_order = [];
        
        if (!session.folders[folderName]) {
            session.folders[folderName] = [];
            session.folder_order.push(folderName);
            writeFileSync(sessionPath, JSON.stringify(session, null, 2));
            runCommand(`notify-send "Desktop Manager" "📁 Created folder '${folderName}'"`);
        } else {
            runCommand(`notify-send "Desktop Manager" "⚠️ Folder '${folderName}' already exists."`);
        }
    } catch (e) {
        console.error("Add Folder error:", e);
    }
}

export function handleRenameFolder(oldName: string, newName: string, sessionPath: string) {
    try {
        if (!existsSync(sessionPath)) return;
        let session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        
        if (session.folders && session.folders[oldName]) {
            if (session.folders[newName]) {
                runCommand(`notify-send "Desktop Manager" "⚠️ Folder '${newName}' already exists."`);
                return;
            }
            
            // Rename in folders dictionary
            session.folders[newName] = session.folders[oldName];
            delete session.folders[oldName];
            
            // Rename in folder_order array
            if (session.folder_order) {
                const idx = session.folder_order.indexOf(oldName);
                if (idx !== -1) {
                    session.folder_order[idx] = newName;
                }
            }
            
            writeFileSync(sessionPath, JSON.stringify(session, null, 2));
            runCommand(`notify-send "Desktop Manager" "✏️ Renamed folder to '${newName}'"`);
        }
    } catch (e) {
        console.error("Rename Folder error:", e);
    }
}

export function handleImportFolder(folderPath: string) {
    try {
        const folderName = basename(folderPath);
        const templatesDir = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates');
        const templatePath = join(templatesDir, `${folderName.toLowerCase().replace(/ /g, '_')}.json`);
        
        const tasks: any[] = [];
        const files = readdirSync(folderPath);
        for (const file of files) {
            const fullPath = join(folderPath, file);
            if (statSync(fullPath).isFile()) {
                const isScript = fullPath.endsWith('.sh');
                let isExec = false;
                try {
                    accessSync(fullPath, constants.X_OK);
                    isExec = true;
                } catch (e) {}
                
                if (isScript || isExec) {
                    const ext = extname(file);
                    const taskName = isScript ? basename(file, ext) : file;
                    const cmd = isScript ? `bash '${fullPath}'` : `'${fullPath}'`;
                    tasks.push({
                        id: require('crypto').randomUUID(),
                        name: taskName,
                        script: cmd
                    });
                }
            }
        }
        
        if (tasks.length > 0) {
            if (!existsSync(templatesDir)) {
                mkdirSync(templatesDir, { recursive: true });
            }
            writeFileSync(templatePath, JSON.stringify({ tasks: tasks }, null, 2));
            runCommand(`notify-send "Desktop Manager" "✅ Imported '${folderName}' with ${tasks.length} scripts."`);
        } else {
            runCommand(`notify-send "Desktop Manager" "⚠️ No scripts found in '${folderName}'."`);
        }
    } catch (e) {
        console.error("Import Folder error:", e);
        runCommand(`notify-send "Desktop Manager" "❌ Failed to import folder."`);
    }
}

export function handleDeleteTemplate(filename: string) {
    try {
        const templatePath = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates', filename);
        if (existsSync(templatePath)) {
            unlinkSync(templatePath);
            runCommand(`notify-send "Desktop Manager" "🗑️ Deleted template '${filename}'"`);
        }
    } catch (e) {
        console.error("Delete Template error:", e);
    }
}

export function handleDeleteTemplateTask(filename: string, taskId: string) {
    try {
        const templatePath = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates', filename);
        if (existsSync(templatePath)) {
            const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
            if (data.tasks) {
                const initialLength = data.tasks.length;
                data.tasks = data.tasks.filter((t: any) => t.id !== taskId);
                if (data.tasks.length < initialLength) {
                    writeFileSync(templatePath, JSON.stringify(data, null, 2));
                    runCommand(`notify-send "Desktop Manager" "🗑️ Deleted script from template"`);
                }
            }
        }
    } catch (e) {
        console.error("Delete Template Task error:", e);
    }
}

export function handleImportScriptToTemplate(filename: string, scriptPath: string) {
    try {
        const templatePath = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates', filename);
        if (existsSync(templatePath)) {
            const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
            if (!data.tasks) data.tasks = [];
            
            const scriptName = basename(scriptPath);
            const taskId = Date.now().toString(); // Simple unique ID
            
            const isScript = scriptPath.endsWith('.sh');
            const cmd = isScript ? `bash '${scriptPath}'` : `'${scriptPath}'`;
            
            data.tasks.push({
                id: taskId,
                name: scriptName.replace(/\.sh$/, ''),
                script: cmd
            });
            
            writeFileSync(templatePath, JSON.stringify(data, null, 2));
            runCommand(`notify-send "Desktop Manager" "📜 Added '${scriptName}' to template"`);
        }
    } catch (e) {
        console.error("Import Script to Template error:", e);
    }
}
export function handleSetTemplateTaskIcon(filename: string, taskId: string, iconsStr: string | null) {
    try {
        const templatePath = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates', filename);
        if (existsSync(templatePath)) {
            const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
            if (data.tasks) {
                const task = data.tasks.find((t: any) => t.id === taskId);
                if (task) {
                    const icons = iconsStr ? iconsStr.split(',').filter(i => i.trim() !== '') : [];
                    task.icons = icons;
                    // Remove legacy icon field if it exists
                    if (task.icon) delete task.icon;
                    
                    writeFileSync(templatePath, JSON.stringify(data, null, 2));
                    runCommand(`notify-send "Desktop Manager" "🖼️ Updated icons for script (${icons.length} set)"`);
                }
            }
        }
    } catch (e) {
        console.error("Set Template Task Icon error:", e);
    }
}

export function handleSetTemplateTaskShortcut(filename: string, taskId: string, shortcut: string | null) {
    try {
        const templatePath = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates', filename);
        if (existsSync(templatePath)) {
            const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
            if (data.tasks) {
                const task = data.tasks.find((t: any) => t.id === taskId);
                if (task) {
                    if (shortcut) {
                        task.shortcut = shortcut;
                    } else {
                        delete task.shortcut;
                    }
                    writeFileSync(templatePath, JSON.stringify(data, null, 2));
                    runCommand(`notify-send "Desktop Manager" "⌨️ Shortcut updated for task: ${shortcut || 'cleared'}"`);
                }
            }
        }
    } catch (e) {
        console.error("Set Template Task Shortcut error:", e);
    }
}
