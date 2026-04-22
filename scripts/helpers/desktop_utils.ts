import { runCommand } from './kwin_utils';

export interface Desktop {
    position: number;
    uuid: string;
    name: string;
}

export function fetchDesktops(): Desktop[] {
    const desktopsOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');
    if (!desktopsOutput) return [];
    
    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    const desktops: Desktop[] = [];
    while ((match = regex.exec(desktopsOutput)) !== null) {
        desktops.push({
            position: parseInt(match[1]),
            uuid: match[2],
            name: match[3]
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
    let cmd = `'/home/dod/projects/Desktop Manager/scripts/switcher-menu.py' --title "Desktop Manager" --menu "Select:" --current "${currentDesktopUuid}"`;
    
    const sorted = [...currentDesktops].sort((a, b) => {
        return getScore(a.name) - getScore(b.name);
    });
    
    for (const d of sorted) {
        const label = d.name || `Desktop ${d.position}`;
        cmd += ` "${d.uuid}___${d.position}" "${label}"`;
    }
    
    cmd += ` "ACTION_CHROME" "  🌐 Launch Chrome Profile..."`;
    return cmd;
}
