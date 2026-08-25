import { runCommand } from './kwin_utils';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { getLabelCache, saveLabelCache } from './label_cache';

export interface Desktop {
    position: number;
    uuid: string;
    name: string;
    priority: string;
    windowCount: number;
}

export function fetchDesktops(): Desktop[] {
    const desktopsOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');
    if (!desktopsOutput) return [];
    
    const cmd = "export PATH=$PATH:~/.local/bin; for id in $(kdotool search --class '.*' 2>/dev/null); do wname=$(kdotool getwindowname $id 2>/dev/null); if [ \"$wname\" != \"Desktop Manager\" ] && [ \"$wname\" != \"Menu\" ] && [ \"$wname\" != \"\" ]; then kdotool get_desktop_for_window $id 2>/dev/null; fi; done 2>/dev/null";
    const windowList = runCommand(cmd) || "";
    const windowCounts: Record<number, number> = {};
    windowList.split('\n').forEach(line => {
        const idx = parseInt(line.trim());
        if (!isNaN(idx) && idx > 0) {
            // kdotool returns 1-based indices, position is 0-based
            const pos = idx - 1;
            windowCounts[pos] = (windowCounts[pos] || 0) + 1;
        }
    });

    const labelCache = getLabelCache();
    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops: Desktop[] = [];
    let cacheUpdated = false;

    const lockFilePath = join(process.env.HOME || '', '.config', 'desktop-manager', '.cli-lock');
    let isLocked = false;
    if (existsSync(lockFilePath)) {
        try {
            const stat = statSync(lockFilePath);
            if (Date.now() - stat.mtimeMs < 60000) isLocked = true;
        } catch(e) {}
    }

    while ((match = regex.exec(desktopsOutput)) !== null) {
        const position = parseInt(match[1]);
        const uuid = match[2];
        let name = match[3];
        let priority = "None";

        // Persistence Logic
        const isNameEmpty = !name || name === "" || name.toLowerCase() === "empty" || name.toLowerCase().startsWith("desktop ");
        
        if (isNameEmpty && labelCache[uuid]) {
            name = labelCache[uuid].name;
            priority = labelCache[uuid].priority;
            if (!isLocked) {
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "${name.replace(/"/g, '\\"')}"`);
            }
        } else if (!isNameEmpty) {
            if (labelCache[uuid]) {
                priority = labelCache[uuid].priority;
                if (name !== labelCache[uuid].name) {
                    if (!isLocked) {
                        labelCache[uuid].name = name;
                        cacheUpdated = true;
                    }
                }
            } else {
                if (!isLocked) {
                    labelCache[uuid] = { name, priority: "None" };
                    cacheUpdated = true;
                }
            }
        }

        desktops.push({
            position,
            uuid,
            name,
            priority,
            windowCount: windowCounts[position] || 0
        });
    }

    if (cacheUpdated) {
        saveLabelCache(labelCache);
    }

    return desktops.sort((a, b) => a.position - b.position);
}

export function getScore(d: Desktop): number {
    const p = d.priority;
    const name = d.name.toLowerCase();
    const isEmpty = !name || name === "" || name === "empty" || name.startsWith("desktop ");

    if (p === "Anchor") return 1;
    if (p === "High") return 2;
    if (p === "Mid") return 3;
    if (p === "Low") return 4;
    if (!isEmpty) return 5; // Named but no priority
    return 6; // Empty
}

export function buildMenuCommand(currentDesktops: Desktop[], currentDesktopUuid: string): string {
    let cmd = `'/home/dod/Projects/My_Desktop_Manager/python_ui/switcher-menu.py' --title "Desktop Manager" --menu "Select:" --current "${currentDesktopUuid}"`;
    
    const sorted = [...currentDesktops].sort((a, b) => {
        let scoreA = getScore(a);
        let scoreB = getScore(b);

        if (a.uuid === currentDesktopUuid) scoreA = scoreA === 6 ? 6.5 : 5.5;
        if (b.uuid === currentDesktopUuid) scoreB = scoreB === 6 ? 6.5 : 5.5;

        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.position - b.position;
    });
    
    for (const d of sorted) {
        const label = d.name || `Desktop ${d.position}`;
        const safeLabel = label.replace(/"/g, '\\"');
        cmd += ` "${d.uuid}___${d.position}" "${safeLabel}"`;
    }
    
    cmd += ` "ACTION_CHROME" "  🌐 Launch Chrome Profile..."`;
    return cmd;
}
