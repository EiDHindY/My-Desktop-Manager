const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Fix R
content = content.replace(
  "const rD = returnDesktopRef.current;\n          const cD = currentDesktopRef.current;\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }",
  "const rD = returnDesktopRef.current;\n          const cD = currentDesktopRef.current;\n          const elToFocus = document.activeElement as HTMLElement;\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }"
);
content = content.replace(
  "if (cD && pureId === cD) return prev;\n              return [...prev, cD as string].slice(-50);\n            });\n          }\n          return;\n        }",
  "if (cD && pureId === cD) return prev;\n              return [...prev, cD as string].slice(-50);\n            });\n            if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }\n          }\n          return;\n        }"
);

// Fix E
content = content.replace(
  "if (e.key.toLowerCase() === 'e') {\n          e.preventDefault();\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }",
  "if (e.key.toLowerCase() === 'e') {\n          e.preventDefault();\n          const elToFocus = document.activeElement as HTMLElement;\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }"
);
content = content.replace(
  "window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current \"${target}\"`);\n            }\n            return currentHist;\n          });\n          return;\n        }",
  "window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current \"${target}\"`);\n            }\n            if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }\n            return currentHist;\n          });\n          return;\n        }"
);

// Fix T
content = content.replace(
  "if (e.key.toLowerCase() === 't') {\n          e.preventDefault();\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }",
  "if (e.key.toLowerCase() === 't') {\n          e.preventDefault();\n          const elToFocus = document.activeElement as HTMLElement;\n          if (activeTabRef.current !== 'notes') {\n            handleSetActiveTab('active');\n          }"
);

fs.writeFileSync('src/App.tsx', content);
