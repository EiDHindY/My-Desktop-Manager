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

import { execSync } from 'child_process';

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

function main() {
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
            
        } else if (result.startsWith('UNDO')) {
            const lastChange = undoStack.pop();
            if (lastChange) {
                runCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "${lastChange.id}" "${lastChange.oldName}"`);
                console.log(`✅ Success! Reversed rename. Restored to: "${lastChange.oldName}"`);
            } else {
                console.log(`❌ Nothing to undo!`);
            }
        }
    }
}

// Start up!
main();
