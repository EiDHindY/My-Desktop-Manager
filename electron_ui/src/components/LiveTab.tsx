import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ReactDOM from 'react-dom';
import PromptModal from './PromptModal';
import { 
  IconTerminal,
  IconNotion,
  IconChrome,
  IconHospitable,
  IconGmail,
  IconCalendar,
  IconWhatsApp,
  IconAntigravity,
  IconMusic,
  IconMessage,
  IconFolder,
  IconMonitor,
  IconRocket,
  IconPencil,
  IconGrip,
  IconFolderOpen,
  IconZap,
  IconUndo,
  IconWipe,
  IconTrash,
  IconChevronRight,
  IconGhost,
  IconPlus
} from './Icons';

/*
const _AppIcon = ({ appClass, size = 12 }: { appClass: string, size?: number }) => {
  ...
};
*/

export default function LiveTab({ sessionData, desktopNames = {}, desktopPriorities = {}, windowCounts = {}, desktopApps: _desktopApps = {}, searchQuery = '', currentDesktop = null, returnDesktop = null, setSessionData, onAction, onSwitch }: { sessionData: any, desktopNames?: Record<string, string>, desktopPriorities?: Record<string, string>, windowCounts?: Record<string, number>, desktopApps?: Record<string, string[]>, searchQuery?: string, currentDesktop?: string | null, returnDesktop?: string | null, setSessionData?: (data: any) => void, onAction?: () => void, onSwitch?: (id: string) => void }) {

  const getPriorityScore = (p: string) => {
    const up = p?.toUpperCase();
    if (up === 'ANCHOR') return 1;
    if (up === 'HIGH') return 2;
    if (up === 'MID') return 3;
    if (up === 'LOW') return 4;
    return 5;
  };

  const getPriorityColor = (p: string) => {
    const up = p?.toUpperCase();
    if (up === 'ANCHOR') return '#38bdf8'; // Blue-ish for Anchor
    if (up === 'HIGH') return '#ff4d4d';   // Sharp Red
    if (up === 'MID') return '#fbbf24';    // Amber
    if (up === 'LOW') return '#34d399';    // Green
    return 'transparent';
  };
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

  useEffect(() => {
    if (searchQuery) {
      const firstDesktopIndex = visibleItems.findIndex(item => item.type === 'desktop');
      setSelectedIndex(firstDesktopIndex !== -1 ? firstDesktopIndex : 0);
    } else {
      // Find which folder contains the current desktop
      const parentFolder = Object.keys(folders).find(folderName => 
        folders[folderName].some((id: string) => id.split("___")[0] === currentDesktop)
      );
      
      // Try to find the desktop itself first
      let targetIndex = visibleItems.findIndex(item => item.id.split("___")[0] === currentDesktop);
      
      // If not found (likely folder is collapsed), find the parent folder
      if (targetIndex === -1 && parentFolder) {
        targetIndex = visibleItems.findIndex(item => item.id === parentFolder);
      }
      
      if (targetIndex !== -1) {
        setSelectedIndex(targetIndex);
      } else {
        setSelectedIndex(0);
      }
    }
  }, [searchQuery, currentDesktop, visibleItems.length]);

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
    
    // Smart positioning logic
    const menuWidth = 220;
    const menuHeight = type === 'folder' ? 180 : 260; // Approximate heights
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Prevent menu from going off-screen horizontally
    if (x + menuWidth > window.innerWidth) {
      x = x - menuWidth;
    }
    
    // Prevent menu from going off-screen vertically
    if (y + menuHeight > window.innerHeight) {
      y = y - menuHeight;
    }

    setContextMenu({ x, y, type, id, folderName });
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

  const renderFolder = (folderName: string, index: number, isDraggable: boolean, displayName?: string) => {
    const label = displayName || folderName;
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
    
    const sortedDesktops = [...displayDesktops].sort((a, b) => {
      const pureIdA = a.split('___')[0];
      const pureIdB = b.split('___')[0];
      const priorityA = getPriorityScore(desktopPriorities[pureIdA] || 'None');
      const priorityB = getPriorityScore(desktopPriorities[pureIdB] || 'None');
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      return 0; // Maintain manual/natural order for everything else
    });

    if (query && !folderMatches && matchingDesktops.length === 0) return null;

    const hasCurrent = sortedDesktops.some((id: string) => id.split("___")[0] === currentDesktop);
    const isSelected = visibleItems[selectedIndex]?.id === folderName;

    const innerContent = (providedDraggable?: any) => (
      <div 
        ref={providedDraggable?.innerRef} 
        {...providedDraggable?.draggableProps} 
        className={`${folderName !== 'root' ? "unified-glass-card" : ""} ${hasCurrent ? "has-current" : ""}`}
        style={{ 
          ...(providedDraggable?.draggableProps.style || {})
        }}
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
              padding: '10px 14px',
              background: hasCurrent ? 'var(--aurora-gradient)' : (isSelected ? 'rgba(187, 154, 247, 0.08)' : 'transparent'),
              alignItems: 'center',
              color: hasCurrent ? '#7dcfff' : '#c8d3f5',
              fontWeight: '600',
              fontSize: '15px',
              position: 'relative',
              transition: 'all 0.25s ease',
              borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.03)' : '1px solid transparent'
            }}
          >
          {hasCurrent && <div className="active-pillar" style={{ top: '20%', bottom: '20%' }} />}
          <span className="drag-handle" style={{ marginRight: '10px', display: 'flex', alignItems: 'center', opacity: hoveredFolder === folderName || isExpanded ? 1 : 0.7, transition: 'opacity 0.2s' }}>
            {hoveredFolder === folderName && folderName !== 'root' ? <IconGrip color="#565f89" /> : (isExpanded ? <IconFolderOpen color="#7aa2f7" /> : <IconFolder color="#565f89" />)}
          </span>
          <span style={{ 
            flex: 1, 
            userSelect: 'none', 
            fontSize: '1.1rem', 
            fontWeight: '600',
            letterSpacing: '0.01em'
          }}>{label}</span>
          
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

          <div style={{ fontSize: '11px', color: '#565f89', flexShrink: 0 }}>
            {folderActive > 0 && <span style={{ color: '#7dcfff', marginRight: '5px', fontWeight: 'bold' }}>{folderActive} active</span>}
            {folderActive > 0 && folderEmpty > 0 && <span style={{ color: '#414868', marginRight: '5px' }}>/</span>}
            {folderEmpty > 0 && <span>{folderEmpty} empty</span>}
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: '4px 0 8px 0', marginLeft: '12px' }}>
            <Droppable droppableId={folderName} type="DESKTOP" isDropDisabled={!!query}>
              {(providedDroppable) => (
                <div 
                  ref={providedDroppable.innerRef} 
                  {...providedDroppable.droppableProps}
                  style={{ display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '10px' }}
                >
                  {sortedDesktops.map((desktopId: string, dIndex: number) => {
                    const pureId = desktopId.split("___")[0];
                    const displayName = desktopNames[pureId] || (pureId.substring(0, 8) + '...');
                    const isActive = pureId === (currentDesktop || '').trim();
                    const isReturn = pureId === (returnDesktop || '').trim();
                    const winCount = windowCounts[pureId] || 0;
                    const hasWindows = winCount > 0;
                    const isSelected = visibleItems[selectedIndex]?.id === desktopId;
                    const isHovered = hoveredDesktop === desktopId;
                    const priority = desktopPriorities[pureId] || 'None';
                    const priorityColor = getPriorityColor(priority);
                    
                    // Determine desktop state classes
                    let stateClass = "desktop-item ";
                    if (isActive) stateClass += "active ";
                    if (hasWindows) stateClass += "busy ";
                    if (!hasWindows && !isActive && !isReturn) stateClass += "empty ";

                    const hasScriptAttached = sessionData?.startup_apps?.[pureId] && sessionData.startup_apps[pureId].length > 0;
                    
                    return (
                      <Draggable draggableId={desktopId} index={dIndex} key={desktopId} isDragDisabled={!!query}>
                        {(providedDesktop, snapshot) => {
                          const content = (
                            <div 
                              ref={providedDesktop.innerRef}
                              {...providedDesktop.draggableProps}
                              {...providedDesktop.dragHandleProps}
                              className={`${stateClass} interactive-element ${isHovered && !snapshot.isDragging ? 'hover-lift' : ''}`}
                              onContextMenu={(e) => handleContextMenu(e, 'desktop', desktopId, folderName)}
                              onClick={() => handleSwitchDesktop(desktopId)}
                              onMouseEnter={() => setHoveredDesktop(desktopId)}
                              onMouseLeave={() => setHoveredDesktop(null)}
                              style={{ 
                                background: snapshot.isDragging ? '#24283b' : (isActive ? 'var(--aurora-gradient)' : (isSelected ? 'rgba(187, 154, 247, 0.08)' : 'transparent')),
                                boxSizing: 'border-box',
                                color: isActive ? '#7dcfff' : (isReturn ? '#bb9af7' : (hasWindows ? '#7aa2f7' : '#9aa5ce')),
                                fontWeight: isActive || isReturn || isSelected ? 'bold' : '500',
                                transition: snapshot.isDragging ? 'none' : 'all 0.25s ease',
                                transform: isActive && !snapshot.isDragging ? 'translateX(2px)' : 'none',
                                paddingLeft: '24px',
                                zIndex: snapshot.isDragging ? 9999 : 1,
                                boxShadow: snapshot.isDragging ? '0 20px 50px rgba(0,0,0,0.5)' : 'none',
                                width: snapshot.isDragging ? (((providedDesktop.draggableProps.style as any)?.width) || '280px') : 'auto',
                                ...(providedDesktop.draggableProps.style || {})
                              }}
                            >
                              {isActive && <div className="active-pillar" style={{ top: '15%', bottom: '15%' }} />}
                              <span style={{ marginRight: '10px', color: isActive ? '#7dcfff' : (isReturn ? '#bb9af7' : (hasWindows ? '#7aa2f7' : '#565f89')), flexShrink: 0, display: 'flex', alignItems: 'center', opacity: isHovered || hasWindows || isActive ? 1 : 0.6 }}>
                                <IconMonitor size={14} />
                              </span>
                              {priority !== 'None' && priority?.toUpperCase() !== 'ANCHOR' && (
                                <div style={{ 
                                  width: '8px', 
                                  height: '8px', 
                                  borderRadius: '50%', 
                                  backgroundColor: priorityColor, 
                                  marginRight: '10px',
                                  boxShadow: `0 0 10px ${priorityColor}88`,
                                  flexShrink: 0
                                }} />
                              )}
                              <span style={{ 
                                flex: 1, 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                color: isHovered && priority !== 'None' ? priorityColor : 'inherit'
                              }}>{displayName}</span>
                              
                              {/* 3. Action Buttons (Appear on hover) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease', flexShrink: 0 }}>
                                {hasScriptAttached && (
                                  <div 
                                    className="btn-hover"
                                    onClick={(e) => { e.stopPropagation(); executeMenuCommand(`SUMMON:${desktopId}`); }}
                                    style={{ 
                                      backgroundColor: 'rgba(187, 154, 247, 0.15)', 
                                      color: '#bb9af7', 
                                      width: '24px', 
                                      height: '24px', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      border: '1px solid rgba(187, 154, 247, 0.3)'
                                    }}
                                    title="Summon"
                                  >
                                    <IconZap size={14} />
                                  </div>
                                )}
                                
                                <div 
                                  className="btn-hover"
                                  onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'Rename Desktop', defaultValue: desktopNames[pureId] || '', command: `RENAME:${desktopId}` }); }}
                                  style={{ 
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                                    color: '#9aa5ce', 
                                    width: '24px', 
                                    height: '24px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    border: '1px solid rgba(255, 255, 255, 0.1)'
                                  }}
                                  title="Rename"
                                >
                                  <IconPencil size={14} />
                                </div>

                                 {/* (Other buttons will remain in the hover group) */}
                              </div>

                              {/* 4. Badges & Fixed Actions */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
                                {isReturn && !isActive && (
                                  <div 
                                    className="btn-hover"
                                    onClick={(e) => { e.stopPropagation(); executeMenuCommand(`GOTO_RETURN:${pureId}`); }}
                                    style={{ 
                                      backgroundColor: 'rgba(187, 154, 247, 0.1)', 
                                      color: '#bb9af7', 
                                      padding: '0 8px', 
                                      height: '24px', 
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      border: '1px solid rgba(187, 154, 247, 0.2)',
                                      borderRadius: '6px'
                                    }}
                                    title="Return to this desktop"
                                  >
                                    <IconUndo size={12} />
                                    <span>Return</span>
                                  </div>
                                )}
                                
                                {isSelected && !isActive && (
                                  <span className="active-badge" style={{ backgroundColor: 'rgba(125, 207, 255, 0.1)', color: '#7dcfff' }}>Selected</span>
                                )}
                                
                                {isActive && <span className="active-badge">CURRENT</span>}

                                {winCount > 0 && !isActive && (
                                  <span className="window-badge" style={{ margin: 0 }}>{winCount}w</span>
                                )}
                              </div>
                            </div>
                          );

                          if (snapshot.isDragging) {
                            return ReactDOM.createPortal(content, document.body);
                          }
                          return content;
                        }}
                      </Draggable>
                    );
                  })}
                  {providedDroppable.placeholder}
                  {desktops.length === 0 && !query && (
                    <div style={{ padding: '20px', color: '#565f89', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', opacity: 0.5 }}>
                      <IconGhost size={24} />
                      <span>Empty neighborhood</span>
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
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
              {folderNames.filter(f => f !== 'root').map((folderName, index) => {
                const parts = folderName.split('/');
                const displayName = parts[parts.length - 1];
                const level = parts.length - 1;
                const indent = level * 24;

                return (
                  <div key={folderName} style={{ marginLeft: `${indent}px` }}>
                    {renderFolder(folderName, index, true, displayName)}
                  </div>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        {/* Render Root statically below the droppable */}
        {folders['root'] && renderFolder('root', 999, false)}
      </div>

      {contextMenu && ReactDOM.createPortal(
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
              <div className="menu-item" onClick={async (e) => {
                e.stopPropagation();
                try {
                  const targetId = contextMenu?.id;
                  const targetFolder = contextMenu?.folderName;
                  
                  if (!targetId) {
                    window.alert("Error: No desktop ID found in context menu!");
                    return;
                  }

                  if (window.confirm(`Are you sure you want to delete this desktop?`)) {
                    // EMERGENCY FLARE: Send a notification immediately
                    await window.electronAPI.executeCommand(`notify-send "Desktop Manager" "Deletion started for: ${targetId}"`);
                    
                    console.log(`Starting deletion for ${targetId} in folder ${targetFolder}`);
                    
                    // OPTIMISTIC UPDATE: Remove it from the local UI immediately
                    if (setSessionData && sessionData && targetFolder) {
                      const newFolders = { ...sessionData.folders };
                      if (newFolders[targetFolder]) {
                        newFolders[targetFolder] = newFolders[targetFolder].filter((id: string) => id !== targetId);
                        setSessionData({ ...sessionData, folders: newFolders });
                      }
                    }
                    
                    // Trigger the actual backend command
                    executeMenuCommand(`CLEAR:${targetId}`);
                  }
                } catch (err: any) {
                  window.alert(`CRITICAL ERROR during delete: ${err.message}`);
                  console.error(err);
                }
              }} style={{ color: '#f7768e' }}>
                <IconTrash size={14} /> Delete Desktop
              </div>
            </>
          )}
        </div>,
        document.body
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
