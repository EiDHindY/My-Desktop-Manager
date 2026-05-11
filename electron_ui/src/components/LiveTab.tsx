import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import PromptModal from './PromptModal';
import { 
  IconFolder, 
  IconFolderOpen, 
  IconMonitor, 
  IconPlus, 
  IconRocket, 
  IconTrash, 
  IconWipe,
  IconChevronRight,
  IconUndo,
  IconGrip,
  IconZap,
  IconPencil
} from './Icons';

export default function LiveTab({ sessionData, desktopNames = {}, windowCounts = {}, searchQuery = '', currentDesktop = null, returnDesktop = null, setSessionData, onAction, onSwitch }: { sessionData: any, desktopNames?: Record<string, string>, windowCounts?: Record<string, number>, searchQuery?: string, currentDesktop?: string | null, returnDesktop?: string | null, setSessionData?: (data: any) => void, onAction?: () => void, onSwitch?: (id: string) => void }) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('desktopManager_expandedFolders');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Persistence: Save to localStorage whenever expandedFolders changes
  useEffect(() => {
    localStorage.setItem('desktopManager_expandedFolders', JSON.stringify(expandedFolders));
  }, [expandedFolders]);

  // Global click listener to close context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const [contextMenu, setContextMenu] = useState<{x: number, y: number, type: 'folder' | 'desktop', id: string, folderName?: string} | null>(null);
  const [promptConfig, setPromptConfig] = useState<{title: string, defaultValue: string, command: string} | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [hoveredDesktop, setHoveredDesktop] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const folders = { ...(sessionData?.folders || {}) };
  
  // Auto-sync: Ensure all system desktops are in SOME folder, otherwise inject into root
  Object.keys(desktopNames || {}).forEach(id => {
    let found = false;
    Object.values(folders).forEach((desktopList: any) => {
      if (Array.isArray(desktopList) && desktopList.some((d: string) => d.split('___')[0] === id)) found = true;
    });
    if (!found) {
      if (!folders['root']) folders['root'] = [];
      folders['root'] = [...folders['root'], `${id}___root`];
    }
  });

  const query = searchQuery.toLowerCase();
  
  // Use saved order if available, otherwise fallback to alphabetical
  let folderNames = Object.keys(folders).filter(f => f !== 'root');
  if (sessionData?.folder_order) {
    const orderMap = new Map<string, number>(sessionData.folder_order.map((f: string, i: number) => [f, i]));
    folderNames.sort((a, b) => {
      const idxA = orderMap.has(a) ? (orderMap.get(a) as number) : 999;
      const idxB = orderMap.has(b) ? (orderMap.get(b) as number) : 999;
      return idxA - idxB;
    });
  } else {
    folderNames.sort((a, b) => a.localeCompare(b));
  }
  if (folders['root']) folderNames.push('root'); // Root always at bottom

  // Flattened list for keyboard navigation
  const visibleItems: { type: 'folder' | 'desktop', id: string, folderName?: string }[] = [];
  folderNames.forEach(folderName => {
    const desktops = folders[folderName] || [];
    const matchingDesktops = desktops.filter((id: string) => {
      const pureId = id.split("___")[0];
      const name = desktopNames[pureId] || "";
      return name.toLowerCase().includes(query);
    });
    const folderMatches = folderName.toLowerCase().includes(query);

    if (query && !folderMatches && matchingDesktops.length === 0) return;

    visibleItems.push({ type: 'folder', id: folderName });
    
    if (expandedFolders.includes(folderName) || query) {
      const sorted = folderName === 'root' 
        ? [...matchingDesktops].sort((a, b) => {
            const pA = a.split('___')[0]; const pB = b.split('___')[0];
            const cA = windowCounts[pA] || 0; const cB = windowCounts[pB] || 0;
            if (cA > 0 && cB === 0) return -1;
            if (cA === 0 && cB > 0) return 1;
            const nA = (desktopNames[pA] || "").toLowerCase(); const nB = (desktopNames[pB] || "").toLowerCase();
            const eA = !nA || nA === "empty"; const eB = !nB || nB === "empty";
            if (!eA && eB) return -1; if (eA && !eB) return 1;
            return 0;
          })
        : (query ? matchingDesktops : desktops);
      
      sorted.forEach((dId: string) => {
        visibleItems.push({ type: 'desktop', id: dId, folderName });
      });
    }
  });

  // Auto-select first desktop when searching
  useEffect(() => {
    if (searchQuery) {
      const firstDesktopIndex = visibleItems.findIndex(item => item.type === 'desktop');
      setSelectedIndex(firstDesktopIndex !== -1 ? firstDesktopIndex : 0);
    } else {
      setSelectedIndex(0);
    }
  }, [searchQuery]);

  // Keyboard Navigation: Ctrl + J / K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          setSelectedIndex(prev => (prev + 1) % visibleItems.length);
        }
      } else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (visibleItems.length > 0) {
          setSelectedIndex(prev => (prev - 1 + visibleItems.length) % visibleItems.length);
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'r' && returnDesktop) {
        e.preventDefault();
        handleSwitchDesktop(returnDesktop);
      } else if (e.key === 'Enter' && visibleItems[selectedIndex]) {
        e.preventDefault();
        const item = visibleItems[selectedIndex];
        if (item.type === 'folder') {
          toggleFolder(item.id);
        } else {
          handleSwitchDesktop(item.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, selectedIndex, returnDesktop]);

  const toggleFolder = (folderName: string) => {
    if (expandedFolders.includes(folderName)) {
      setExpandedFolders(expandedFolders.filter(f => f !== folderName));
    } else {
      setExpandedFolders([...expandedFolders, folderName]);
    }
  };

  const executeMenuCommand = async (command: string) => {
    setContextMenu(null);
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "${command}"`);
    if (onAction) onAction();
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'desktop', id: string, folderName?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, folderName });
  };

  const handleDeployAll = async (folderName: string) => {
    setContextMenu(null);
    // Call the backend sequencer which handles the 1.5s delay and summoning
    await executeMenuCommand(`SUMMON_FOLDER:${folderName}`);
  };

  const onDragEnd = async (result: any) => {
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
      // Await so fast-refresh fires AFTER backend has written new order
      await executeMenuCommand(`REORDER_FOLDERS:${currentOrder.join(',')}`);
    } 
    else if (type === 'DESKTOP') {
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;
      
      const draggedId = result.draggableId;
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

      // Await backend write BEFORE onAction (which triggers fast-refresh)
      // @ts-ignore
      await window.electronAPI.moveDesktop(draggedId, destFolder, destination.index);
      if (onAction) onAction();
    }
  };

  const handleSwitchDesktop = (id: string) => {
    if (onSwitch) onSwitch(id);
    const pureId = id.split("___")[0];
    // @ts-ignore
    window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${pureId}"`);
  };

  const renderFolder = (folderName: string, index: number, isDraggable: boolean) => {
    const desktops = folders[folderName] || [];
    
    const matchingDesktops = desktops.filter((id: string) => {
      const pureId = id.split("___")[0];
      const name = desktopNames[pureId] || "";
      return name.toLowerCase().includes(query);
    });

    const folderMatches = folderName.toLowerCase().includes(query);
    const displayDesktops = (query && !folderMatches) ? matchingDesktops : desktops;
    const isExpanded = expandedFolders.includes(folderName) || query;
    
    const folderActive = displayDesktops.filter((id: string) => ((windowCounts || {})[id.split("___")[0]] || 0) > 0).length;
    const folderEmpty = displayDesktops.length - folderActive;
    
    const sortedDesktops = folderName === 'root' 
      ? [...displayDesktops].sort((a, b) => {
          const pureIdA = a.split('___')[0];
          const pureIdB = b.split('___')[0];
          const nameA = (desktopNames[pureIdA] || "").toLowerCase();
          const nameB = (desktopNames[pureIdB] || "").toLowerCase();
          const countA = windowCounts[pureIdA] || 0;
          const countB = windowCounts[pureIdB] || 0;
          
          const isAEmpty = !nameA || nameA === "empty" || nameA.startsWith("desktop ");
          const isBEmpty = !nameB || nameB === "empty" || nameB.startsWith("desktop ");
          
          if (countA > 0 && countB === 0) return -1;
          if (countA === 0 && countB > 0) return 1;
          
          if (!isAEmpty && isBEmpty) return -1;
          if (isAEmpty && !isBEmpty) return 1;
          
          return 0;
        })
      : displayDesktops;

    if (query && !folderMatches && matchingDesktops.length === 0) return null;

    const innerContent = (providedDraggable?: any) => (
      <div 
        ref={providedDraggable?.innerRef} 
        {...providedDraggable?.draggableProps} 
        style={{ marginBottom: '10px', ...(providedDraggable?.draggableProps.style || {}) }}
      >
        <div 
          {...providedDraggable?.dragHandleProps}
          className="interactive-element"
          onContextMenu={(e) => handleContextMenu(e, 'folder', folderName)}
          onClick={() => toggleFolder(folderName)}
          onMouseEnter={() => setHoveredFolder(folderName)}
          onMouseLeave={() => setHoveredFolder(null)}
          style={{ 
            display: 'flex', 
            height: '36px', 
            marginBottom: '2px', 
            padding: '0 12px',
            backgroundColor: visibleItems[selectedIndex]?.id === folderName || hoveredFolder === folderName ? '#292e42' : 'transparent',
            borderRadius: '6px',
            alignItems: 'center',
            color: '#c8d3f5',
            fontWeight: '600',
            fontSize: '14px',
            border: visibleItems[selectedIndex]?.id === folderName || hoveredFolder === folderName ? '1px solid #565f89' : '1px solid transparent',
            transition: 'all 0.15s ease-in-out'
          }}
        >
          <span className="drag-handle" style={{ marginRight: '10px', display: 'flex', alignItems: 'center', opacity: hoveredFolder === folderName || isExpanded ? 1 : 0.7, transition: 'opacity 0.2s' }}>
            {hoveredFolder === folderName && folderName !== 'root' ? <IconGrip color="#565f89" /> : (isExpanded ? <IconFolderOpen color="#7aa2f7" /> : <IconFolder color="#565f89" />)}
          </span>
          <span style={{ flex: 1, userSelect: 'none' }}>{folderName}</span>
          
          {hoveredFolder === folderName && (
            <div 
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'New Desktop Name', defaultValue: 'New Desktop', command: `CREATE_LIVE_DESKTOP:${folderName}` }); }}
              style={{ 
                backgroundColor: '#7aa2f7', 
                color: '#1a1b26', 
                borderRadius: '4px', 
                width: '24px', 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginRight: '10px'
              }}
              title="Add Desktop"
            >
              <IconPlus size={16} />
            </div>
          )}

          {hoveredFolder === folderName && folderName !== 'root' && (
            <div 
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); handleDeployAll(folderName); }}
              style={{ 
                backgroundColor: '#bb9af7', 
                color: '#1a1b26', 
                borderRadius: '4px', 
                width: '24px', 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginRight: '10px'
              }}
              title="Summon All Desktops"
            >
              <IconRocket size={16} />
            </div>
          )}
          
          {hoveredFolder === folderName && folderName !== 'root' && (
            <div 
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'New Folder Name', defaultValue: folderName, command: `RENAME_FOLDER:${folderName}` }); }}
              style={{ 
                backgroundColor: '#3b4261', 
                color: '#c8d3f5', 
                borderRadius: '4px', 
                width: '24px', 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginRight: '10px'
              }}
              title="Rename Folder"
            >
              <IconPencil size={14} />
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#565f89' }}>
            {folderActive > 0 && <span style={{ color: '#7dcfff', marginRight: '5px', fontWeight: 'bold' }}>{folderActive} active</span>}
            {folderActive > 0 && folderEmpty > 0 && <span style={{ color: '#414868', marginRight: '5px' }}>/</span>}
            {folderEmpty > 0 && <span>{folderEmpty} empty</span>}
          </div>
        </div>

        {isExpanded && (
          <Droppable droppableId={folderName} type="DESKTOP" isDropDisabled={!!query}>
            {(providedDroppable) => (
              <div 
                ref={providedDroppable.innerRef} 
                {...providedDroppable.droppableProps}
                style={{ marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '10px' }}
              >
                {sortedDesktops.map((desktopId: string, dIndex: number) => {
                  const pureId = desktopId.split("___")[0];
                  const displayName = desktopNames[pureId] || (pureId.substring(0, 8) + '...');
                  const isActive = pureId === (currentDesktop || '').trim();
                  const isReturn = pureId === (returnDesktop || '').trim();
                  const winCount = windowCounts[pureId] || 0;
                  const hasWindows = winCount > 0;
                  const isInactive = !hasWindows && !isActive && !isReturn;
                  const hasScriptAttached = sessionData?.startup_apps?.[pureId] && sessionData.startup_apps[pureId].length > 0;
                  
                  return (
                    <Draggable draggableId={desktopId} index={dIndex} key={desktopId} isDragDisabled={!!query}>
                      {(providedDesktop, snapshot) => (
                        <div 
                          ref={providedDesktop.innerRef}
                          {...providedDesktop.draggableProps}
                          {...providedDesktop.dragHandleProps}
                          className="interactive-element"
                          onContextMenu={(e) => handleContextMenu(e, 'desktop', desktopId, folderName)}
                          onClick={() => handleSwitchDesktop(desktopId)}
                          onMouseEnter={() => setHoveredDesktop(desktopId)}
                          onMouseLeave={() => setHoveredDesktop(null)}
                          style={{ 
                            display: 'flex', 
                            height: '32px', 
                            marginBottom: '2px',
                            padding: '0 0 0 12px',
                            alignItems: 'center',
                            background: snapshot.isDragging ? '#1a1b26' : (isActive ? 'linear-gradient(90deg, rgba(125, 207, 255, 0.35) 0%, transparent 100%)' : (isReturn ? 'linear-gradient(90deg, rgba(187, 154, 247, 0.04) 0%, transparent 100%)' : (visibleItems[selectedIndex]?.id === desktopId || hoveredDesktop === desktopId ? '#292e42' : 'transparent'))),
                            borderTop: snapshot.isDragging ? '1px solid #565f89' : (visibleItems[selectedIndex]?.id === desktopId || hoveredDesktop === desktopId ? '1px solid #565f89' : '1px solid transparent'),
                            borderRight: snapshot.isDragging ? '1px solid #565f89' : (visibleItems[selectedIndex]?.id === desktopId || hoveredDesktop === desktopId ? '1px solid #565f89' : '1px solid transparent'),
                            borderBottom: snapshot.isDragging ? '1px solid #565f89' : (visibleItems[selectedIndex]?.id === desktopId || hoveredDesktop === desktopId ? '1px solid #565f89' : '1px solid transparent'),
                            borderLeft: isActive ? '3px solid #7dcfff' : (isReturn ? '3px solid #bb9af7' : (hasWindows ? '3px solid #7aa2f7' : '3px solid transparent')),
                            borderRadius: '6px',
                            boxSizing: 'border-box',
                            opacity: isInactive && !snapshot.isDragging && hoveredDesktop !== desktopId ? 0.6 : 1,
                            color: isActive ? '#7dcfff' : (isReturn ? '#bb9af7' : (hasWindows ? '#7aa2f7' : '#9aa5ce')),
                            fontSize: '13px',
                            fontWeight: isActive || isReturn || visibleItems[selectedIndex]?.id === desktopId ? 'bold' : '500',
                            transition: 'all 0.15s ease-in-out',
                            boxShadow: snapshot.isDragging ? '0 10px 20px rgba(0,0,0,0.5)' : 'none',
                            ...(providedDesktop.draggableProps.style || {})
                          }}
                        >
                          <span style={{ marginRight: '10px', color: isActive ? '#7dcfff' : (isReturn ? '#bb9af7' : (hasWindows ? '#7aa2f7' : '#565f89')), flexShrink: 0, display: 'flex', alignItems: 'center', opacity: hoveredDesktop === desktopId || hasWindows ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                            <IconMonitor size={14} color="currentColor" />
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                            {displayName}
                          </span>
                          {/* Always-visible window count badge for hasWindows state */}
                          {winCount > 0 && !isActive && (
                            <span style={{
                              marginRight: '8px',
                              flexShrink: 0,
                              color: '#1a1b26',
                              backgroundColor: '#7aa2f7',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              letterSpacing: '0.3px'
                            }}>{winCount}w</span>
                          )}
                          
                          {hoveredDesktop === desktopId && hasScriptAttached && (
                            <div 
                              className="btn-hover"
                              onClick={(e) => { e.stopPropagation(); executeMenuCommand(`SUMMON:${desktopId}`); }}
                              style={{ 
                                backgroundColor: 'rgba(187, 154, 247, 0.15)', 
                                color: '#bb9af7', 
                                borderRadius: '4px', 
                                width: '24px', 
                                height: '24px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                marginRight: '8px',
                                border: '1px solid rgba(187, 154, 247, 0.3)'
                              }}
                              title="Summon"
                            >
                              <IconZap size={14} />
                            </div>
                          )}

                          {hoveredDesktop === desktopId && (
                            <div 
                              className="btn-hover"
                              onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'Rename Desktop', defaultValue: desktopNames[pureId] || '', command: `RENAME:${desktopId}` }); }}
                              style={{ 
                                backgroundColor: '#3b4261', 
                                color: '#c8d3f5', 
                                borderRadius: '4px', 
                                width: '24px', 
                                height: '24px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                marginRight: '8px'
                              }}
                              title="Rename"
                            >
                              <IconPencil size={14} />
                            </div>
                          )}

                          {isReturn && !isActive && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#bb9af7', marginRight: '8px' }}>
                              <IconUndo size={12} /> Return
                            </span>
                          )}

                          {isActive && <span style={{ fontSize: '11px', background: 'linear-gradient(90deg, #7dcfff, #7aa2f7)', color: '#1a1b26', padding: '1px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Current</span>}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {providedDroppable.placeholder}
                {desktops.length === 0 && !query && (
                  <div style={{ padding: '4px 10px', color: '#565f89', fontSize: '12px', fontStyle: 'italic' }}>
                    Empty folder
                  </div>
                )}
              </div>
            )}
          </Droppable>
        )}
      </div>
    );

    if (!isDraggable) {
      return <div key={folderName}>{innerContent()}</div>;
    }

    return (
      <Draggable draggableId={folderName} index={index} key={folderName} isDragDisabled={!!query}>
        {(provided) => innerContent(provided)}
      </Draggable>
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ width: '100%', height: '100%' }}>
      <div style={{ padding: '10px' }}>
        <Droppable droppableId="board" type="FOLDER">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {folderNames.filter(f => f !== 'root').map((folderName, index) => renderFolder(folderName, index, true))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        {/* Render Root statically below the droppable */}
        {folders['root'] && renderFolder('root', 999, false)}
      </div>

      {contextMenu && (
        <div 
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'folder' ? (
            <>
              <div className="menu-item" onClick={() => setPromptConfig({ title: 'New Desktop Name', defaultValue: 'New Desktop', command: `CREATE_LIVE_DESKTOP:${contextMenu.id}` })}>
                <IconPlus size={14} /> Add Desktop
              </div>
              <div className="menu-item" onClick={() => handleDeployAll(contextMenu.id)}>
                <IconRocket size={14} /> Deploy Entire Folder
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`WIPE_FOLDER:${contextMenu.id}`)}>
                <IconWipe size={14} /> Wipe Apps & Keep
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`REMOVE_LIVE_FOLDER:${contextMenu.id}`)}>
                <IconTrash size={14} /> Delete Folder
              </div>
            </>
          ) : (
            <>
              <div className="menu-item" onClick={() => executeMenuCommand(`SUMMON:${contextMenu.id}`)}>
                <IconZap size={14} color="#bb9af7" /> Summon
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`CLOSE_WINDOWS:${contextMenu.id}`)}>
                <IconTrash size={14} color="#f7768e" /> Close Windows
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`UNGROUP_DESKTOP:${contextMenu.folderName}:${contextMenu.id}`)}>
                <IconChevronRight size={14} /> Ungroup
              </div>
              <div className="menu-item" onClick={() => setPromptConfig({ title: 'Rename Desktop', defaultValue: desktopNames[contextMenu.id.split('___')[0]] || '', command: `RENAME:${contextMenu.id}` })}>
                <IconPencil size={14} /> Rename
              </div>
              <div className="menu-item" onClick={() => {
                if (window.confirm('Are you sure you want to delete this desktop?')) {
                  executeMenuCommand(`CLEAR:${contextMenu.id}`);
                }
              }} style={{ color: '#f7768e' }}>
                <IconTrash size={14} /> Delete Desktop
              </div>
            </>
          )}
        </div>
      )}

      {promptConfig && (
        <PromptModal 
          title={promptConfig.title}
          defaultValue={promptConfig.defaultValue}
          onSubmit={(value) => {
            executeMenuCommand(`${promptConfig.command}:${value}`);
            setPromptConfig(null);
          }}
          onCancel={() => setPromptConfig(null)}
        />
      )}
      </div>
    </DragDropContext>
  );
}
