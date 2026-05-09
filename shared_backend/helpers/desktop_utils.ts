import { runCommand } from './kwin_utils';

export interface Desktop {
    position: number;
    uuid: string;
    name: string;
    windowCount: number;
}

export function fetchDesktops(): Desktop[] {
    const desktopsOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');
    if (!desktopsOutput) return [];
    
    // Fetch window counts using wmctrl
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

    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops: Desktop[] = [];
    while ((match = regex.exec(desktopsOutput)) !== null) {
        const position = parseInt(match[1]);
        desktops.push({
            position,
            uuid: match[2],
            name: match[3],
            windowCount: windowCounts[position] || 0
        });
    }
    return desktops.sort((a, b) => a.position - b.position);
}

export function getScore(rawName: string): number {
    const name = rawName.toLowerCase();
    if (!name || name === "" || name === "empty" || name.startsWith("desktop ")) return 4;
    if (name.startsWith("(main)")) return 1;
    if (name.startsWith("(task)")) return 2;
    return 3;
}

export function buildMenuCommand(currentDesktops: Desktop[], currentDesktopUuid: string): string {
    let cmd = `'/home/dod/projects/Desktop Manager/python_ui/switcher-menu.py' --title "Desktop Manager" --menu "Select:" --current "${currentDesktopUuid}"`;
    
    const sorted = [...currentDesktops].sort((a, b) => {
        return getScore(a.name) - getScore(b.name);
    });
    
    for (const d of sorted) {
        const label = d.name || `Desktop ${d.position}`;
        // BUG-11 FIX: A desktop name with a " in it breaks the shell command string.
        const safeLabel = label.replace(/"/g, '\\"');
        cmd += ` "${d.uuid}___${d.position}" "${safeLabel}"`;
    }
    
    cmd += ` "ACTION_CHROME" "  🌐 Launch Chrome Profile..."`;
    return cmd;
}
