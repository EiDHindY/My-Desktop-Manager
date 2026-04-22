import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { runCommand, setDesktopName } from './kwin_utils';

/**
 * Checks if this is a fresh boot session or a new day.
 */
export function checkFreshSession(sessionPath: string) {
    const today = new Date().toISOString().split('T')[0];
    const flagPath = '/tmp/desktop-manager-session.flag';
    
    let needsCleanup = false;
    if (!existsSync(flagPath)) {
        needsCleanup = true;
    } else {
        const flagDate = readFileSync(flagPath, 'utf-8').trim();
        if (flagDate !== today) {
            needsCleanup = true;
        }
    }

    if (needsCleanup) {
        // Cleanup logic could go here if needed in the future
    }

    try {
        writeFileSync(flagPath, today);
    } catch (e) {}
}

/**
 * Saves a sparse snapshot of the current desktops.
 */
export function saveSnapshot(snapshotName: string, templatesDir: string, sessionPath: string, currentDesktops: any[]) {
    const targetPath = join(templatesDir, `${snapshotName.toLowerCase().replace(/\s+/g, '_')}.json`);
    
    let sessionData: any = { folders: {}, folder_order: [], desktop_notes: {} };
    try {
        if (existsSync(sessionPath)) {
            sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        }
    } catch (e) {}

    const desktopsToSave: Record<number, string> = {};
    currentDesktops.forEach((d, idx) => {
        const name = d.name.trim();
        const isGeneric = name === "" || name.toLowerCase() === "empty" || /^desktop \d+$/i.test(name);
        
        let isInFolder = false;
        for (const fName in sessionData.folders) {
            if (sessionData.folders[fName].some((id: string) => id.split("___")[1] === idx.toString())) {
                isInFolder = true;
                break;
            }
        }

        if (!isGeneric || isInFolder) {
            desktopsToSave[idx] = d.name;
        }
    });

    const snapshot = {
        name: snapshotName,
        created: new Date().toISOString(),
        desktop_count: currentDesktops.length,
        desktops: desktopsToSave,
        folders: sessionData.folders,
        folder_order: sessionData.folder_order || Object.keys(sessionData.folders),
        desktop_notes: sessionData.desktop_notes || {}
    };

    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(targetPath, JSON.stringify(snapshot, null, 2));
    runCommand(`notify-send "Desktop Manager" "💾 Snapshot '${snapshotName}' saved (Sparse)!"`);
}

/**
 * Applies a template to the current desktops.
 */
export function applyTemplate(templatePath: string, currentDesktops: any[], sessionPath: string) {
    try {
        const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
        const templateDesktops = template.desktops;
        
        // 1. Restore Names
        for (let idx = 0; idx < currentDesktops.length; idx++) {
            const desktop = currentDesktops[idx];
            let newName = null;

            if (Array.isArray(templateDesktops)) {
                if (idx < templateDesktops.length) {
                    const tName = templateDesktops[idx];
                    if (tName !== "Empty" && !tName.startsWith("Desktop ")) {
                        newName = tName;
                    }
                }
            } else if (templateDesktops && typeof templateDesktops === 'object') {
                if (templateDesktops[idx]) {
                    newName = templateDesktops[idx];
                }
            }

            if (newName && newName !== desktop.name) {
                setDesktopName(desktop.uuid, newName);
            }
        }
        
        // 2. Restore Folders
        let sessionData: any = {};
        try {
            if (existsSync(sessionPath)) sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        } catch (e) {
            sessionData = { folders: {}, folder_order: [] };
        }

        const templateFolders = template.folders || {};
        const sessionFolders: Record<string, string[]> = {};
        
        for (const [folderName, indices] of Object.entries(templateFolders)) {
            sessionFolders[folderName] = (indices as number[]).map((posIdx: number) => {
                if (posIdx < currentDesktops.length) {
                    return `${currentDesktops[posIdx].uuid}___${posIdx}`;
                }
                return '';
            }).filter((id: string) => id !== '');
        }
        
        sessionData.folders = sessionFolders;
        sessionData.folder_order = template.folder_order || Object.keys(sessionFolders);
        sessionData.desktop_notes = template.desktop_notes || {};
        
        writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
        runCommand(`notify-send "Desktop Manager" "🚀 Template '${template.name}' applied!"`);
    } catch (e) {
        console.error(`❌ Error applying template: ${e}`);
    }
}
