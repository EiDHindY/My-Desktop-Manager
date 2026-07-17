import { join } from 'path';
import { fetchDesktops } from './helpers/desktop_utils';
import { runCommand, launchAppsForDesktop } from './helpers/kwin_utils';
import { updateLabel, updateIcon, updateShortcut } from './helpers/label_cache';
import { 
    handleCreateLiveDesktop, 
    handleRemoveLiveFolder,
    handleClear,
    handleSummonFolder,
    handleDeploy,
    handleUngroupDesktop,
    handleCleanEmpty,
    handleClearAll,
    handleAddFolder,
    handleRenameFolder,
    handleImportFolder,
    handleCreateTemplate,
    handleImportScriptToTemplate,
    handleCreateScriptAndAddToTemplate,
    handleDeleteTemplate,
    handleDeleteTemplateTask,
    handleSetTemplateTaskIcon,
    handleSetTemplateTaskShortcut,
    handleRenameTemplateScript
} from './helpers/command_handlers';
import { saveSnapshot, applyTemplate } from './helpers/session_manager';

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    console.error("No command provided.");
    process.exit(1);
}

const libraryDir = join(process.env.HOME || '', '.config', 'desktop-manager');
const sessionPath = join(libraryDir, 'session.json');
const templatesDir = join(libraryDir, 'templates');

const currentDesktops = fetchDesktops();
const currentUuid = runCommand('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current') || "";

const desktopMap = new Map<string, string>();
for (const d of currentDesktops) {
    desktopMap.set(`${d.uuid}___${d.position}`, d.name || `Desktop ${d.position}`);
}

console.log(`Executing: ${command}`);
runCommand(`notify-send "Desktop Manager" "Executing command: ${command.split(':')[0]}"`);

if (command.startsWith('RENAME:')) {
    const parts = command.substring(7).split(':');
    const id = parts[0];
    let fresh = parts[1] || "";
    
    if (!fresh) {
        const oldName = desktopMap.get(id) || "";
        const renamePy = join(__dirname, '..', 'python_ui', 'rename-box.py');
        fresh = runCommand(`'${renamePy}' "${oldName}"`) || "";
    }

    if (fresh) {
        const pureId = id.split("___")[0];
        const [nameOnly] = fresh.split('|');
        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${pureId}" "${nameOnly.replace(/"/g, '\\"')}"`);
        updateLabel(pureId, fresh);
    }
} else if (command.startsWith('SET_ICON:')) {
    const parts = command.substring(9).split(':');
    const id = parts[0];
    const iconsStr = parts.slice(1).join(':') || null;
    const pureId = id.split("___")[0];
    updateIcon(pureId, iconsStr);
} else if (command.startsWith('SET_SHORTCUT:')) {
    const parts = command.substring(13).split(':');
    const id = parts[0];
    const shortcutStr = parts.slice(1).join(':') || null;
    const pureId = id.split("___")[0];
    updateShortcut(pureId, shortcutStr);
} else if (command.startsWith('CREATE_LIVE_DESKTOP:')) {
    const parts = command.substring(20).split(':');
    const folderName = parts[0];
    const providedName = parts[1] || "";
    console.log(`Creating desktop in folder: "${folderName}" with name: "${providedName}"`);
    handleCreateLiveDesktop(folderName, sessionPath, currentDesktops, currentUuid, providedName);
} else if (command.startsWith('SUMMON_FOLDER:')) {
    handleSummonFolder(command.substring(14), sessionPath);
} else if (command.startsWith('WIPE_FOLDER:')) {
    handleRemoveLiveFolder(command.substring(12), sessionPath, true);
} else if (command.startsWith('REMOVE_LIVE_FOLDER:')) {
    handleRemoveLiveFolder(command.substring(19), sessionPath, false);
} else if (command.startsWith('UNGROUP_DESKTOP:')) {
    handleUngroupDesktop(command, sessionPath);
} else if (command.startsWith('IMPORT_FOLDER:')) {
    handleImportFolder(command.substring(14));
} else if (command.startsWith('CREATE_TEMPLATE:')) {
    handleCreateTemplate(command.substring(16));
} else if (command.startsWith('CREATE_TEMPLATE_DIVIDER:')) {
    handleCreateTemplate(command.substring(24), true);
} else if (command.startsWith('IMPORT_SCRIPT_TO_TEMPLATE:')) {
    const parts = command.substring(26).split(":");
    const filename = parts[0];
    const scriptPath = parts.slice(1).join(":");
    handleImportScriptToTemplate(filename, scriptPath);
} else if (command.startsWith('CREATE_SCRIPT_TO_TEMPLATE:')) {
    const parts = command.substring(26).split(":");
    const filename = parts[0];
    const scriptName = parts.slice(1).join(":");
    handleCreateScriptAndAddToTemplate(filename, scriptName);
} else if (command.startsWith('DELETE_TEMPLATE:')) {
    handleDeleteTemplate(command.substring(16));
} else if (command.startsWith('DELETE_TEMPLATE_TASK:')) {
    const parts = command.substring(21).split(":");
    handleDeleteTemplateTask(parts[0], parts[1]);
} else if (command.startsWith('RENAME_TEMPLATE_SCRIPT:')) {
    const parts = command.substring(23).split(":");
    const filename = parts[0];
    const taskId = parts[1];
    const newName = parts.slice(2).join(":");
    handleRenameTemplateScript(filename, taskId, newName);
} else if (command.startsWith('SET_TEMPLATE_TASK_ICON:')) {
    const parts = command.substring(23).split(":");
    const filename = parts[0];
    const taskId = parts[1];
    const iconsStr = parts.slice(2).join(":") || null;
    handleSetTemplateTaskIcon(filename, taskId, iconsStr);
} else if (command.startsWith('SET_TEMPLATE_TASK_SHORTCUT:')) {
    const parts = command.substring(27).split(":");
    const filename = parts[0];
    const taskId = parts[1];
    const shortcut = parts.slice(2).join(":") || null;
    handleSetTemplateTaskShortcut(filename, taskId, shortcut);
} else if (command.startsWith('SUMMON:')) {
    const pureId = command.substring(7).split("___")[0];
    runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${pureId}"`);
    
    // Also execute any startup apps associated with this desktop
    launchAppsForDesktop(pureId);
} else if (command.startsWith('CLOSE_WINDOWS:')) {
    let target = command.substring(14).split("___")[0];
    let finalIdx: string | null = null;

    // Resolve UUID to index if needed
    if (target && target.length > 5) {
        const d = currentDesktops.find(desk => desk.uuid === target);
        if (d) {
            finalIdx = (d.position + 1).toString();
        }
    } else if (target) {
        // If it's already a number, assume it was a 0-based position and increment it
        finalIdx = (parseInt(target) + 1).toString();
    }
    
    if (finalIdx) {
        console.log(`Closing windows on 1-based desktop index: ${finalIdx}`);
        const { closeWindowsOnDesktop } = require('./helpers/kwin_utils');
        closeWindowsOnDesktop(finalIdx);
    }
} else if (command.startsWith('DEPLOY_')) {
    handleDeploy(command, sessionPath, currentDesktops, currentUuid);
} else if (command === 'CLEAN_EMPTY') {
    handleCleanEmpty(currentDesktops, sessionPath);
} else if (command === 'CLEAR_ALL') {
    handleClearAll(currentDesktops, currentUuid, sessionPath);
} else if (command.startsWith('CLEAR:')) {
    handleClear(command, sessionPath, desktopMap, [], currentDesktops);
} else if (command === 'ADD_FOLDER') {
    // Usually triggered to create a "New Folder" and we use prompt for the name.
    // However, if the command has a parameter: ADD_FOLDER:MyName
    const name = "New Folder"; 
    // We let handleAddFolder generate a name or we pass it? Wait, the UI prompts for it:
    // command: 'ADD_FOLDER'
    // but PromptModal passes: `${promptConfig.command}:${value}`
    // so it will arrive as ADD_FOLDER:My Folder Name
} else if (command.startsWith('ADD_FOLDER:')) {
    const parts = command.split(':');
    const newName = parts.slice(1).join(':').trim();
    if (newName) {
        handleAddFolder(newName, sessionPath);
    }
} else if (command.startsWith('RENAME_FOLDER:')) {
    const parts = command.split(':');
    const oldName = parts[1];
    const newName = parts.slice(2).join(':').trim();
    if (oldName && newName && oldName !== newName) {
        handleRenameFolder(oldName, newName, sessionPath);
    }
} else if (command.startsWith('MOVE_DESKTOP:')) {
    const parts = command.substring(13).split(':');
    if (parts.length >= 3) {
        const fullId = parts[0];
        const targetFolder = parts[1];
        const index = parseInt(parts[2]);
        console.log(`Moving desktop ${fullId} to folder "${targetFolder}" at index ${index}`);
        
        try {
            const { readFileSync, writeFileSync } = require('fs');
            const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
            if (data.folders) {
                // Remove from all folders
                for (const f of Object.keys(data.folders)) {
                    data.folders[f] = data.folders[f].filter((id: string) => id !== fullId);
                }
                
                // Add to target folder at specific index
                if (!data.folders[targetFolder]) data.folders[targetFolder] = [];
                const targetArray = data.folders[targetFolder];
                targetArray.splice(index, 0, fullId);
                
                writeFileSync(sessionPath, JSON.stringify(data, null, 2));
            }
        } catch(e) {
            console.error('Error moving desktop:', e);
        }
    }
} else if (command.startsWith('REORDER_FOLDERS:')) {
    const foldersStr = command.substring(16);
    if (foldersStr) {
        const newOrder = foldersStr.split(',');
        try {
            const { readFileSync, writeFileSync } = require('fs');
            const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
            data.folder_order = newOrder;
            writeFileSync(sessionPath, JSON.stringify(data, null, 2));
            console.log('Saved new folder order:', newOrder);
        } catch(e) {
            console.error('Error saving folder order:', e);
        }
    }
} else if (command.startsWith('REORDER_TEMPLATES:')) {
    const foldersStr = command.substring(18);
    if (foldersStr) {
        const newOrder = foldersStr.split(',');
        try {
            const { readFileSync, writeFileSync } = require('fs');
            const libPath = join(libraryDir, 'library.json');
            let data: any = {};
            try { data = JSON.parse(readFileSync(libPath, 'utf-8')); } catch(e) {}
            data.folder_order = newOrder;
            writeFileSync(libPath, JSON.stringify(data, null, 2));
            console.log('Saved new template order:', newOrder);
        } catch(e) {
            console.error('Error saving template order:', e);
        }
    }
} else if (command.startsWith('MOVE_TASK:')) {
    const parts = command.substring(10).split(':');
    if (parts.length >= 3) {
        const filename = parts[0];
        const taskId = parts[1];
        const index = parseInt(parts[2]);
        try {
            const { readFileSync, writeFileSync } = require('fs');
            const templatePath = join(templatesDir, filename);
            const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
            if (data.tasks) {
                const taskIndex = data.tasks.findIndex((t: any) => t.id === taskId);
                if (taskIndex !== -1) {
                    const [task] = data.tasks.splice(taskIndex, 1);
                    data.tasks.splice(index, 0, task);
                    writeFileSync(templatePath, JSON.stringify(data, null, 2));
                    console.log(`Moved task ${taskId} in ${filename} to index ${index}`);
                }
            }
        } catch(e) {
            console.error('Error moving task:', e);
        }
    }
}
