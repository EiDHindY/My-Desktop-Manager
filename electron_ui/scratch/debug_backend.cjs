const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function debug() {
  try {
    const [currentRes, desktopsRes] = await Promise.all([
      execAsync('qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current'),
      execAsync('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops'),
    ]);

    const output = desktopsRes.stdout;
    console.log("QDBUS OUTPUT LENGTH:", output.length);

    const regex = /\[Argument: \(uss\) (\d+), "([^"]+)", "([^"]+)"\]/g;
    let match;
    let count = 0;
    while ((match = regex.exec(output)) !== null) {
      count++;
      console.log(`Match ${count}: pos=${match[1]}, uuid=${match[2]}, name=${match[3]}`);
    }
    console.log("TOTAL MATCHES:", count);

    console.log("\n--- KDOTOOL WINDOW CLASSES ---");
    const kdotoolRes = await execAsync(
      `for id in $(kdotool search --class '.*' 2>/dev/null); do ` +
      `wclass=$(kdotool getwindowclassname "$id" 2>/dev/null); ` +
      `desktop=$(qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktopContainingWindow "$id" 2>/dev/null); ` +
      `echo "$desktop:$wclass"; ` +
      `done`
    );
    console.log(kdotoolRes.stdout);
  } catch (e) {
    console.error("ERROR:", e);
  }
}

debug();
