/// <reference types="node" />
/**
 * label-desktop.ts
 * 
 * A TypeScript tool for managing KDE Plasma 6 virtual desktops.
 * Changed: Now skips the first menu entirely and jumps straight to the desktop list!
 * 
 * Learning Note for DoD:
 * We're using 'child_process' to run terminal commands from within 
 * our TypeScript code. This is very common in Node.js for automation.
 * We also added Regex (Regular Expressions) to parse text!
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Executes a shell command and returns the output.
 * If the user cancels a dialog, it returns undefined instead of crashing the script.
 */
function runCommand(command: string): string | undefined {
    try {
        return execSync(command).toString().trim();
    } catch (error) {
        // This is normal if a user cancels the menu (exit status 1)
        return undefined;
    }
}

/**
 * Triggers assigned startup apps for a specific desktop.
 */
function launchAppsForDesktop(uuid: string) {
    const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
    const sessionPath = join(sessionDir, 'session.json');
    try {
        const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        const apps = data.startup_apps?.[uuid] || [];
        if (apps.length > 0) {
            console.log(`🚀 Launching ${apps.length} apps for desktop ${uuid}...`);
            apps.forEach((cmd: string) => {
                spawn('bash', ['-c', cmd], {
                    detached: true,
                    stdio: 'ignore',
                    env: { ...process.env, DISPLAY: ':0' } // Ensure GUI apps find the display
                }).unref();
            });
        }
    } catch (e) {
        console.error(`❌ Error launching apps: ${e}`);
    }
}

function main() {
    // Start the history tracker in the background
    spawn('/home/dod/projects/Desktop Manager/scripts/desktop-tracker.py', [], {
        detached: true,
        stdio: 'ignore'
    }).unref();

    let undoStack: { id: string, oldName: string }[] = [];
    // Wrap everything in a continuous loop so you can always go back!
    while (true) {
        
        // 1. Instantly pull the list of desktops using D-Bus.
        const desktopsOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');
        if (!desktopsOutput) break; // Safety check
        
        const regex = /\[Argument: \(uss\) \d+, "([^"]+)", "([^"]+)"\]/g;
        const currentDesktop = runCommand('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current');
        
        // We construct the menu command. "Ctrl+/ to Rename"
        let menuCmd = `'/home/dod/projects/Desktop Manager/scripts/switcher-menu.py' --title "Desktop Manager" --menu "Hit Enter/Click to Jump, or press Ctrl+/ to Rename:" --current "${currentDesktop}"`;
        let match: RegExpExecArray | null;
        let desktopMap = new Map<string, string>();
        
        let kwinIndex = 1;
        // Loop through all meshes found by Regex and add them as arguments for the python script
        while ((match = regex.exec(desktopsOutput)) !== null) {
            const rawId = match[1];
            // Encode the physical kwinIndex tightly directly into the id string!
            const id = `${rawId}___${kwinIndex}`;
            const name = match[2] || "Empty";
            
            desktopMap.set(id, name);
            kwinIndex++;
        }
        
        // Smart Sort: Categorical Priority Hierarchy
        let desktopEntries = Array.from(desktopMap.entries());
        desktopEntries.sort((a, b) => {
            const nameA = a[1] ? a[1].trim().toLowerCase() : "";
            const nameB = b[1] ? b[1].trim().toLowerCase() : "";
            
            const getScore = (rawName: string) => {
                const name = rawName.toLowerCase();
                
                if (!name || name === "" || name === "empty" || name.startsWith("desktop ")) return 4; // Bottom priority (Empties)
                if (name.startsWith("(main)")) return 1; // Top Priority
                if (name.startsWith("(task)")) return 2; // Second Priority
                return 3; // Everything else (Custom names like 'Anti')
            };
            
            return getScore(nameA) - getScore(nameB);
        });
        
        let counter = 1;
        for (const [id, label] of desktopEntries) {
            const name = label || `Desktop ${counter}`;
            menuCmd += ` "${id}" "${name}"`;
            counter++;
        }
        
        // --- CHROME INJECTION ---
        menuCmd += ` "ACTION_CHROME" "  🌐 Launch Chrome Profile..."`;
        
        // 2. Launch the custom UI and wait for the user to do something!
        const result = runCommand(menuCmd);
        
        if (!result) {
            // User hit Cancel or Escape. Completely close the app.
            console.log('❌ App closed.');
            process.exit(0);
        }
        
        // 3. Process the response from switcher-menu.py!
        if (result.startsWith('SWITCH:')) {
            // They hit Enter or Clicked the mouse! Jump to the desktop.
            const rawOutput = result.substring(7); // Remove the "SWITCH:" prefix
            const selectedId = rawOutput.split("___")[0]; // Rip out the kwinIndex payload mapping
            
            if (selectedId === 'ACTION_CHROME') {
                runCommand('/home/dod/.local/bin/chrome_launcher.sh');
                console.log(`✅ Chrome Profile selection finished.`);
                continue;
            }
            
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${selectedId}"`);
            console.log(`🚀 Switched to desktop: ${selectedId}`);
            
            // Loop automatically restarts the menu on the new desktop!
            
        } else if (result.startsWith('SWITCH_UUID:')) {
            const selectedId = result.substring(12);
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${selectedId}"`);
            console.log(`🚀 Switched to desktop (UUID): ${selectedId}`);
            
        } else if (result.startsWith('RENAME:')) {
            const fullKey = result.substring(7); // uuid___index string
            const selectedId = fullKey.split("___")[0]; // Raw UUID
            const currentName = (desktopMap.get(fullKey) || "Empty").replace(/"/g, '\\"');
            
            const newNameRaw = runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "${currentName}"`);
            
            if (newNameRaw !== undefined && newNameRaw !== null) {
                const newName = newNameRaw.replace(/"/g, '\\"');
                undoStack.push({ id: selectedId, oldName: (desktopMap.get(fullKey) || "Empty") });
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${selectedId}" "${newName}"`);
                console.log(`✅ Success! Desktop renamed to: "${newNameRaw}"`);
            }
            
            // Loop automatically restarts to show the updated desktop list!
            
        } else if (result.startsWith('CLEAR:')) {
            // They hit Ctrl+Enter! Instantly set the desktop name to Empty!
            const rawOutput = result.substring(6); // Remove the "CLEAR:" prefix
            const selectedParts = rawOutput.split("___");
            const selectedId = selectedParts[0];
            const kwinIndex = selectedParts.length > 1 ? selectedParts[1] : null;
            const currentName = desktopMap.get(rawOutput) || "";
            
            undoStack.push({ id: selectedId, oldName: currentName });
            
            // 1. Rename to Empty
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${selectedId}" "Empty"`);
            
            // 2. Close All Windows
            if (kwinIndex) {
                runCommand(`
                    for id in $(kdotool search --class '.*'); do 
                        wname=$(kdotool getwindowname $id 2>/dev/null)
                        if [[ "$wname" != "Desktop Manager" ]] && [[ "$wname" != "Menu" ]]; then
                            desk=$(kdotool get_desktop_for_window $id 2>/dev/null)
                            if [[ "$desk" == "${kwinIndex}" ]]; then
                                kdotool windowclose $id
                            fi
                        fi
                    done
                `);
            }
            console.log(`✅ Success! Desktop name set to Empty and windows closed.`);
            
        } else if (result.startsWith('RENAME_MAIN:')) {
            const fullKey = result.substring(12);
            const selectedId = fullKey.split("___")[0];
            const currentName = desktopMap.get(fullKey) || "";
            const newNameRaw = runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "(Main) "`);
            if (newNameRaw !== undefined && newNameRaw !== null) {
                const newName = newNameRaw.replace(/"/g, '\\"');
                undoStack.push({ id: selectedId, oldName: currentName });
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${selectedId}" "${newName}"`);
                console.log(`✅ Success! Desktop renamed to: "${newNameRaw}"`);
            }
            
        } else if (result.startsWith('RENAME_TASK:')) {
            const fullKey = result.substring(12);
            const selectedId = fullKey.split("___")[0];
            const currentName = desktopMap.get(fullKey) || "";
            const newNameRaw = runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "(Task) "`);
            if (newNameRaw !== undefined && newNameRaw !== null) {
                const newName = newNameRaw.replace(/"/g, '\\"');
                undoStack.push({ id: selectedId, oldName: currentName });
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${selectedId}" "${newName}"`);
                console.log(`✅ Success! Desktop renamed to: "${newNameRaw}"`);
            }
            
        } else if (result.startsWith('CLOSE_WINDOWS:')) {
            const rawOutput = result.substring(14);
            const selectedParts = rawOutput.split("___");
            const kwinIndex = selectedParts.length > 1 ? selectedParts[1] : null;
            
            if (kwinIndex) {
                runCommand(`
                    for id in $(kdotool search --class '.*'); do 
                        wname=$(kdotool getwindowname $id 2>/dev/null)
                        if [[ "$wname" != "Desktop Manager" ]] && [[ "$wname" != "Menu" ]]; then
                            desk=$(kdotool get_desktop_for_window $id 2>/dev/null)
                            if [[ "$desk" == "${kwinIndex}" ]]; then
                                kdotool windowclose $id
                            fi
                        fi
                    done
                `);
                console.log(`✅ Success! Closed windows on virtual desktop index ${kwinIndex}`);
            }
            
        } else if (result.startsWith('SUMMON:')) {
            const fullKey = result.substring(7); // uuid___index string
            const selectedId = fullKey.split("___")[0]; // Raw UUID
            
            // 1. Switch to the desktop
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${selectedId}"`);
            
            // 2. Launch associated apps
            launchAppsForDesktop(selectedId);
            
            console.log(`🚀 Summoned desktop: ${selectedId}`);
            // Loop restarts menu on the new desktop

        } else if (result.startsWith('SUMMON_ALL:')) {
            // Summon everything across all desktops
            const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
            const sessionPath = join(sessionDir, 'session.json');
            try {
                const data = JSON.parse(readFileSync(sessionPath, 'utf-8'));
                const startupApps = data.startup_apps || {};
                const uuids = Object.keys(startupApps);
                
                let lastUuid = "";
                for (const uuid of uuids) {
                    if (startupApps[uuid] && startupApps[uuid].length > 0) {
                        // Switch and launch
                        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${uuid}"`);
                        launchAppsForDesktop(uuid);
                        lastUuid = uuid;
                        // Tiny delay to prevent KDE from tripping over rapid switches
                        execSync('sleep 0.2');
                    }
                }
                
                // Finally, ensure we land on the last summoned desktop
                if (lastUuid) {
                   runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${lastUuid}"`);
                }
            } catch (e) {}

        } else if (result.startsWith('UNDO')) {
            const lastChange = undoStack.pop();
            if (lastChange) {
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${lastChange.id}" "${lastChange.oldName}"`);
                console.log(`✅ Success! Reversed rename. Restored to: "${lastChange.oldName}"`);
            } else {
                console.log(`❌ Nothing to undo!`);
            }
        } else if (result.startsWith('LOAD_TEMPLATE:')) {
            // ─── Template Application ───
            const templateFilename = result.substring(14);
            const templatesDir = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates');
            const templatePath = join(templatesDir, templateFilename);
            
            try {
                const templateData = JSON.parse(readFileSync(templatePath, 'utf-8'));
                const templateDesktops: string[] = templateData.desktops || [];
                
                // Get current desktops from KDE
                const currentOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');
                if (!currentOutput) {
                    console.log('❌ Could not read current desktops.');
                    continue;
                }
                
                const currentRegex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
                let currentMatch: RegExpExecArray | null;
                const currentDesktops: { position: number, uuid: string, name: string }[] = [];
                
                while ((currentMatch = currentRegex.exec(currentOutput)) !== null) {
                    currentDesktops.push({
                        position: parseInt(currentMatch[1]),
                        uuid: currentMatch[2],
                        name: currentMatch[3]
                    });
                }
                
                // Sort by position to ensure correct ordering
                currentDesktops.sort((a, b) => a.position - b.position);
                
                // Rename each desktop by position
                for (let idx = 0; idx < currentDesktops.length; idx++) {
                    const desktop = currentDesktops[idx];
                    const newName = idx < templateDesktops.length ? templateDesktops[idx] : 'Empty';
                    
                    if (desktop.name !== newName) {
                        const safeName = newName.replace(/"/g, '\\"');
                        runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${desktop.uuid}" "${safeName}"`);
                    }
                }
                
                // Update session.json with template's folder layout, mapping position indices to real UUIDs
                const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
                const sessionPath = join(sessionDir, 'session.json');
                
                const templateFolders: Record<string, number[]> = templateData.folders || {};
                const sessionFolders: Record<string, string[]> = {};
                
                for (const [folderName, indices] of Object.entries(templateFolders)) {
                    sessionFolders[folderName] = (indices as number[]).map((posIdx: number) => {
                        if (posIdx < currentDesktops.length) {
                            const kwinIdx = posIdx + 1;
                            return `${currentDesktops[posIdx].uuid}___${kwinIdx}`;
                        }
                        return '';
                    }).filter((id: string) => id !== '');
                }
                
                // Handle extra desktops not covered by template — put them in default folder
                const coveredPositions = new Set<number>();
                for (const indices of Object.values(templateFolders)) {
                    for (const idx of (indices as number[])) {
                        coveredPositions.add(idx);
                    }
                }
                
                const defaultFolder = templateData.default_folder || 'root';
                const extraIds: string[] = [];
                for (let idx = 0; idx < currentDesktops.length; idx++) {
                    if (!coveredPositions.has(idx)) {
                        const kwinIdx = idx + 1;
                        extraIds.push(`${currentDesktops[idx].uuid}___${kwinIdx}`);
                    }
                }
                if (extraIds.length > 0) {
                    if (!sessionFolders[defaultFolder]) {
                        sessionFolders[defaultFolder] = [];
                    }
                    sessionFolders[defaultFolder].push(...extraIds);
                }
                
                const sessionData = {
                    folders: sessionFolders,
                    folder_order: templateData.folder_order || [],
                    default_folder: defaultFolder,
                    startup_apps: templateData.startup_apps || {}
                };
                
                // Ensure default folder is in folder_order
                if (!sessionData.folder_order.includes(defaultFolder) && sessionFolders[defaultFolder]) {
                    sessionData.folder_order.push(defaultFolder);
                }
                
                mkdirSync(sessionDir, { recursive: true });
                writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
                
                console.log(`✅ Template "${templateData.name}" applied! Renamed ${currentDesktops.length} desktops.`);
            } catch (err) {
                console.log(`❌ Failed to load template: ${err}`);
            }
        } else if (result.startsWith('NEW_DESKTOP')) {
            // ─── Create a New Virtual Desktop ───
            const countRes = runCommand('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.count');
            const pos = countRes ? parseInt(countRes) : 0;
            runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.createDesktop ${pos} "Empty"`);
            console.log(`✅ Success! Created new virtual desktop at position ${pos}.`);

        } else if (result.startsWith('SAVE_WORKSPACE:')) {
            // ─── Save Current Desktop as Portable Workspace ───
            const desktopIdFull = result.substring(15); // uuid___index
            const desktopUuid = desktopIdFull.split("___")[0];
            const desktopName = (desktopMap.get(desktopIdFull) || "Workspace").replace(/"/g, '');
            
            const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
            const sessionPath = join(sessionDir, 'session.json');
            const workspacesDir = join(sessionDir, 'workspaces');
            mkdirSync(workspacesDir, { recursive: true });

            try {
                const sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
                const apps = sessionData.startup_apps?.[desktopUuid] || [];
                
                const workspaceData = {
                    name: desktopName,
                    apps: apps,
                    created: new Date().toISOString()
                };

                const safeName = desktopName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const workspacePath = join(workspacesDir, `${safeName}.json`);
                writeFileSync(workspacePath, JSON.stringify(workspaceData, null, 2));
                console.log(`✅ Workspace "${desktopName}" saved!`);
            } catch (e) {
                console.log(`❌ Failed to save workspace: ${e}`);
            }

        } else if (result.startsWith('APPLY_WORKSPACE:')) {
            // ─── Apply Workspace Definition to a Desktop Slot ───
            const payload = result.substring(16); // uuid___index|filename.json
            const [desktopIdFull, filename] = payload.split('|');
            const desktopUuid = desktopIdFull.split("___")[0];
            
            const sessionDir = join(process.env.HOME || '', '.config', 'desktop-manager');
            const workspacePath = join(sessionDir, 'workspaces', filename);

            try {
                const wsData = JSON.parse(readFileSync(workspacePath, 'utf-8'));
                const newName = wsData.name;
                const apps = wsData.apps || [];

                // 1. Rename the desktop
                const safeName = newName.replace(/"/g, '\\"');
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${desktopUuid}" "${safeName}"`);

                // 2. Update startup apps in session.json
                const sessionPath = join(sessionDir, 'session.json');
                const sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
                if (!sessionData.startup_apps) sessionData.startup_apps = {};
                sessionData.startup_apps[desktopUuid] = apps;
                writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

                // 3. Launch apps
                launchAppsForDesktop(desktopUuid);

                console.log(`✅ Applied workspace "${newName}" to desktop!`);
            } catch (e) {
                console.log(`❌ Failed to apply workspace: ${e}`);
            }

        } else if (result.startsWith('DELETE_TEMPLATE:')) {
            const templateFilename = result.substring(16);
            const templatesDir = join(process.env.HOME || '', '.config', 'desktop-manager', 'templates');
            const templatePath = join(templatesDir, templateFilename);
            try {
                unlinkSync(templatePath);
                console.log(`✅ Success! Deleted template: ${templateFilename}`);
            } catch (err) {
                console.log(`❌ Failed to delete template: ${err}`);
            }
        }
    }
}

// Start up!
main();
