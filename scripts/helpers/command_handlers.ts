import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { runCommand, launchAppsForDesktop } from './kwin_utils';
import { Desktop } from './desktop_utils';

export function handleClear(result: string, sessionPath: string, desktopMap: Map<string, string>, undoStack: any[]) {
    const rawOutput = result.substring(6);
    const parts = rawOutput.split("___");
    const id = parts[0];
    const kwinIdx = parts.length > 1 ? parts[1] : null;
    
    undoStack.push({ id, oldName: desktopMap.get(rawOutput) || "" });
    runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${id}" "Empty"`);
    
    if (kwinIdx) {
        runCommand(`wmctrl -l | awk -v d="${kwinIdx}" '$2 == d {print $1}' | xargs -r -I{} wmctrl -i -c {}`);
    }
    
    try {
        if (existsSync(sessionPath)) {
            const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
            if (data.folders) {
                for (const f of Object.keys(data.folders)) data.folders[f] = data.folders[f].filter((i: string) => i !== rawOutput);
            }
            if (data.desktop_notes) delete data.desktop_notes[id];
            writeFileSync(sessionPath, JSON.stringify(data, null, 2));
        }
    } catch (e) {}
}

export function handleSummonFolder(folderName: string, sessionPath: string) {
    try {
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const uids: string[] = data.folders?.[folderName] || [];
        if (uids.length === 0) return runCommand(`notify-send "Desktop Manager" "Folder is empty."`);
        
        runCommand(`notify-send "Desktop Manager" "🚀 Summoning '${folderName}'..."`);
        for (const fullId of uids) {
            const uuid = fullId.split("___")[0];
            if (uuid) {
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${uuid}"`);
                launchAppsForDesktop(uuid, true);
                execSync('sleep 0.1');
            }
        }
    } catch (e) {}
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
        folderName = dataStr;
    } else {
        const parts = dataStr.split(':');
        folderName = parts[0];
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
            const entry = `${dest.uuid}___${dest.position}`;
            for (const f of Object.keys(session.folders)) session.folders[f] = session.folders[f].filter((id: string) => id !== entry);
            session.folders[folderName].push(entry);
            if (t.script) session.startup_apps[dest.uuid] = [t.script];
        }
        writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        runCommand(`notify-send "Desktop Manager" "🚀 Deployed ${tasks.length} tasks to '${folderName}'"`);
    } catch (e) {
        console.error("Deploy error:", e);
    }
}

export function handleCreateLiveDesktop(folderName: string, sessionPath: string, currentDesktops: Desktop[], currentUuid: string) {
    try {
        const name = runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "New Desktop"`);
        if (!name) return;

        const empties = currentDesktops.filter(d => {
            const isNameEmpty = ["", "empty"].includes(d.name.toLowerCase().trim()) || /^desktop \d+$/.test(d.name.toLowerCase());
            return isNameEmpty && d.uuid !== currentUuid;
        });

        if (empties.length === 0) return runCommand(`kdialog --msgbox "No empty desktops available (excluding your current one)."`);

        const dest = empties[0];
        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${dest.uuid}" "${name}"`);

        let session = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        if (!session.folders) session.folders = {};
        if (!session.folders[folderName]) session.folders[folderName] = [];
        
        const entry = `${dest.uuid}___${dest.position}`;
        for (const f of Object.keys(session.folders)) session.folders[f] = session.folders[f].filter((id: string) => id !== entry);
        session.folders[folderName].push(entry);

        writeFileSync(sessionPath, JSON.stringify(session, null, 2));
        runCommand(`notify-send "Desktop Manager" "➕ Created '${name}' in '${folderName}'"`);
    } catch (e) {}
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

export function handleRemoveLiveFolder(folderName: string, sessionPath: string) {
    try {
        if (!existsSync(sessionPath)) return;
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const uids: string[] = data.folders?.[folderName] || [];
        if (uids.length === 0) return;

        const indices = uids.map(id => id.split("___")[1]).filter(idx => idx !== undefined);
        if (indices.length > 0) {
            const pattern = indices.join('|');
            runCommand(`wmctrl -l | awk '$2 ~ /^(${pattern})$/ {print $1}' | xargs -r -I{} wmctrl -i -c {}`);
        }

        for (const fullId of uids) {
            const uuid = fullId.split("___")[0];
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "Empty"`);
            if (data.desktop_notes) delete data.desktop_notes[uuid];
            if (data.startup_apps) delete data.startup_apps[uuid];
        }

        if (data.folders) delete data.folders[folderName];
        if (data.folder_order) data.folder_order = data.folder_order.filter((f: string) => f !== folderName);

        writeFileSync(sessionPath, JSON.stringify(data, null, 2));
        runCommand(`notify-send "Desktop Manager" "🧹 Folder '${folderName}' cleared and removed."`);
    } catch (e) {}
}
