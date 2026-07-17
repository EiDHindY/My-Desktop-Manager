import fs from 'fs';
const content = fs.readFileSync('src/components/LiveTab.tsx', 'utf-8');

const missingCode = `
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, selectedIndex, returnDesktop]);

  const toggleFolder = (folderName: string) => {
    if (expandedFolders.includes(folderName)) {
      setExpandedFolders(expandedFolders.filter(f => f !== folderName));
    } else {
      setExpandedFolders([...expandedFolders, folderName]);
    }
  };

  const executeMenuCommand = (command: string) => {
    // @ts-ignore
    window.electronAPI.executeCommand(\`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "\${command}"\`);
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'desktop', id: string, folderName?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, folderName });
  };

  const onDragEnd = (result: any) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === 'FOLDER') {
      if (source.index === destination.index) return;
      const currentOrder = folderNames.filter((f: string) => f !== 'root');
      const [removed] = currentOrder.splice(source.index, 1);
      currentOrder.splice(destination.index, 0, removed);
      currentOrder.push('root');

      if (setSessionData) {
        setSessionData({ ...sessionData, folder_order: currentOrder });
      }
      executeMenuCommand(\`REORDER_FOLDERS:\${currentOrder.join(',')}\`);
    } 
    else if (type === 'DESKTOP') {
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;
      
      const draggedId = result.draggableId;
      const sourceFolder = source.droppableId;
      const destFolder = destination.droppableId;

      if (setSessionData) {
        const newFolders = { ...sessionData.folders };
        Object.keys(newFolders).forEach(f => {
          newFolders[f] = newFolders[f].filter((id: string) => id !== draggedId);
        });
        if (!newFolders[destFolder]) newFolders[destFolder] = [];
        newFolders[destFolder].splice(destination.index, 0, draggedId);
        setSessionData({ ...sessionData, folders: newFolders });
      }

      if (onAction) onAction();
      // @ts-ignore
      window.electronAPI.moveDesktop(draggedId, destFolder, destination.index);
    }
  };

  const handleSwitchDesktop = (id: string) => {
    if (onSwitch) onSwitch(id);
    const pureId = id.split("___")[0];
    // @ts-ignore
    window.electronAPI.executeCommand(\`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "\${pureId}"\`);
  };

`;

const splitIndex = content.indexOf("  const renderFolder =");
const newContent = content.substring(0, splitIndex) + missingCode + content.substring(splitIndex);

fs.writeFileSync('src/components/LiveTab.tsx', newContent, 'utf-8');
