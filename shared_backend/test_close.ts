import { runCommand, closeWindowsOnDesktopByUUID } from './helpers/kwin_utils';

console.log("Running test close on Empty desktops...");
const desktopsOutput = runCommand('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops');

const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
let match;
while ((match = regex.exec(desktopsOutput || '')) !== null) {
    if (match[3] === "Empty") {
        console.log(`Found Empty desktop: ${match[2]} at index ${match[1]}`);
        closeWindowsOnDesktopByUUID(match[2]);
    }
}
