/// <reference types="node" />
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn, execSync } from 'child_process';

// Helpers
import { runCommand, launchAppsForDesktop } from './helpers/kwin_utils';
import { checkFreshSession, saveSnapshot, applyTemplate } from './helpers/session_manager';
import { fetchDesktops, buildMenuCommand } from './helpers/desktop_utils';
import { handleClear, handleSummonFolder, handleDeploy, handleRemoveLibraryFolder, handleRemoveLiveFolder, handleCreateLiveDesktop, handleUngroupDesktop } from './helpers/command_handlers';

function main() {
    const lockPath = '/tmp/desktop-manager.lock';
    if (existsSync(lockPath)) {
        try {
            const oldPid = readFileSync(lockPath, 'utf-8').trim();
            process.kill(parseInt(oldPid), 0);
            process.exit(0);
        } catch (e) { unlinkSync(lockPath); }
    }
    writeFileSync(lockPath, process.pid.toString());
    process.on('exit', () => { try { unlinkSync(lockPath); } catch(e) {} });
    process.on('SIGINT', () => { process.exit(); });
    process.on('SIGTERM', () => { process.exit(); });

    spawn(join(__dirname, 'desktop-tracker.py'), [], { detached: true, stdio: 'ignore' }).unref();

    let undoStack: any[] = [];
    const libraryDir = join(process.env.HOME || '', '.config', 'desktop-manager');
    const sessionPath = join(libraryDir, 'session.json');
    const templatesDir = join(libraryDir, 'templates');

    checkFreshSession(sessionPath);

    while (true) {
        const currentDesktops = fetchDesktops();
        if (currentDesktops.length === 0) break;
        
        const currentUuid = runCommand('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current') || "";
        const menuCmd = buildMenuCommand(currentDesktops, currentUuid);
        const desktopMap = new Map<string, string>();
        for (const d of currentDesktops) desktopMap.set(`${d.uuid}___${d.position}`, d.name || `Desktop ${d.position}`);
        
        const result = (runCommand(menuCmd) || "").trim();
        if (!result) process.exit(0);
        console.log(`📡 Command received: "${result}"`);
        
        if (result.startsWith('REMOVE_LIBRARY_FOLDER:')) {
            handleRemoveLibraryFolder(result.substring(22), templatesDir);
        } else if (result.startsWith('REMOVE_LIVE_FOLDER:')) {
            handleRemoveLiveFolder(result.substring(19), sessionPath);
        } else if (result.startsWith('CREATE_LIVE_DESKTOP:')) {
            handleCreateLiveDesktop(result.substring(20), sessionPath, currentDesktops, currentUuid);
        } else if (result.startsWith('UNGROUP_DESKTOP:')) {
            handleUngroupDesktop(result, sessionPath);
        } else if (result.startsWith('SAVE_SNAPSHOT:')) {
            saveSnapshot(result.split(':')[1], templatesDir, sessionPath, currentDesktops);
        } else if (result.startsWith('SWITCH:')) {
            const id = result.substring(7).split("___")[0];
            if (id === 'ACTION_CHROME') runCommand('/home/dod/.local/bin/chrome_launcher.sh');
            else runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${id}"`);
            // Wait for KWin to process the switch before re-opening the menu
            execSync('sleep 0.3');
        } else if (result.startsWith('RENAME:')) {
            const key = result.substring(7), id = key.split("___")[0], old = desktopMap.get(key) || "";
            const fresh = runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "${old}"`);
            if (fresh) {
                undoStack.push({ id, oldName: old });
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${id}" "${fresh.replace(/"/g, '\\"')}"`);
            }
        } else if (result.startsWith('CLEAR:')) {
            handleClear(result, sessionPath, desktopMap, undoStack);
        } else if (result.startsWith('SUMMON:')) {
            const id = result.substring(7).split("___")[0];
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${id}"`);
            launchAppsForDesktop(id);
            execSync('sleep 0.3');
        } else if (result.startsWith('SUMMON_FOLDER:')) {
            handleSummonFolder(result.substring(14), sessionPath);
        } else if (result.startsWith('UNDO')) {
            const last = undoStack.pop();
            if (last) runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${last.id}" "${last.oldName}"`);
        } else if (result.startsWith('LOAD_TEMPLATE:')) {
            applyTemplate(join(templatesDir, result.substring(14)), currentDesktops, sessionPath);
        } else if (result.startsWith('DEPLOY_ALL:') || result.startsWith('DEPLOY_SELECTED:') || result.startsWith('DEPLOY_TASK:')) {
            handleDeploy(result, sessionPath, currentDesktops, currentUuid);
        } else if (result.startsWith('DELETE_TEMPLATE:')) {
            try { unlinkSync(join(templatesDir, result.substring(16))); } catch(e) {}
        }
    }
}

main();
