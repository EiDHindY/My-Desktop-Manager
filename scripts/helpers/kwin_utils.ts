import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Executes a shell command and returns the output.
 */
export function runCommand(command: string): string | undefined {
    try {
        return execSync(command).toString().replace(/\n$/, '');
    } catch (error) {
        return undefined;
    }
}

/**
 * Triggers assigned startup apps for a specific desktop.
 */
export function launchAppsForDesktop(uuid: string, waitUntilFinished: boolean = false) {
    const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
    const sessionPath = join(sessionDir, 'session.json');
    try {
        if (!existsSync(sessionPath)) return;
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const apps = data.startup_apps?.[uuid] || [];
        if (apps.length > 0) {
            console.log(`🚀 Launching ${apps.length} apps for desktop ${uuid}...`);
            apps.forEach((cmd: string) => {
                if (waitUntilFinished) {
                    try {
                        execSync(cmd, { stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } });
                    } catch (e) {}
                } else {
                    spawn('bash', ['-c', cmd], {
                        detached: true,
                        stdio: 'ignore',
                        env: { ...process.env, DISPLAY: ':0' }
                    }).unref();
                }
            });
        }
    } catch (e) {
        console.error(`❌ Error launching apps: ${e}`);
    }
}

/**
 * Renames a virtual desktop.
 */
export function setDesktopName(uuid: string, name: string) {
    const safeName = name.replace(/"/g, '\\"');
    runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${uuid}" "${safeName}"`);
}

/**
 * Closes all windows on a specific desktop index.
 * Uses kdotool for Wayland compatibility.
 */
export function closeWindowsOnDesktop(kwinIdx: string) {
    const cmd = `kdotool search --class "." 2>/dev/null | while read id; do ` +
                `d=$(kdotool get_desktop_for_window $id 2>/dev/null); ` +
                `if [ "$d" = "${kwinIdx}" ]; then ` +
                `name=$(kdotool getwindowname $id 2>/dev/null); ` +
                `if [[ -n "$name" && "$name" != "Desktop Manager" && "$name" != "Menu" && "$name" != "Rename Desktop" && "$name" != "Chrome Launcher" && "$name" != "plasma-desktop" && "$name" != "Plasma" ]]; then ` +
                `kdotool windowclose $id 2>/dev/null; ` +
                `fi; fi; done`;
    runCommand(cmd);
}
