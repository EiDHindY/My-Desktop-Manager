import { runCommand } from './kwin_utils';
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
    
    const windowList = runCommand('wmctrl -l') || "";
    const windowCounts: Record<number, number> = {};
    windowList.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const desktopIdx = parseInt(parts[1]);
            if (!isNaN(desktopIdx)) {
                windowCounts[desktopIdx] = (windowCounts[desktopIdx] || 0) + 1;
            }
        }
    });

    const labelCache = getLabelCache();
    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops: Desktop[] = [];
    let cacheUpdated = false;

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
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "${name.replace(/"/g, '\\"')}"`);
        } else if (!isNameEmpty) {
            if (labelCache[uuid]) {
                priority = labelCache[uuid].priority;
                if (name !== labelCache[uuid].name) {
                    labelCache[uuid].name = name;
                    cacheUpdated = true;
                }
            } else {
                labelCache[uuid] = { name, priority: "None" };
                cacheUpdated = true;
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
        const scoreA = getScore(a);
        const scoreB = getScore(b);
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
