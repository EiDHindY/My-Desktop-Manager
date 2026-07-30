const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(
  "window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current \"${target}\"`);\n            }\n            return currentHist;\n          });\n          return;\n        }\n        if (e.key.toLowerCase() === 'z'",
  "window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current \"${target}\"`);\n            }\n            if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }\n            return currentHist;\n          });\n          return;\n        }\n        if (e.key.toLowerCase() === 'z'"
);

fs.writeFileSync('src/App.tsx', content);
