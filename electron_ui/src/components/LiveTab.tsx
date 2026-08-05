import { useState, useEffect, useMemo, useRef } from 'react';
import { fuzzyMatch } from '../utils';
import { CLI_PATH } from '../constants';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { createPortal } from 'react-dom';
import PromptModal from './PromptModal';
import DesktopItem from './DesktopItem';
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
  IconPlus,
  IconLoader,
  IconKeyboard,
  ManualIcon
} from './Icons';
import IconPicker from './IconPicker';

/*
const _AppIcon = ...
*/




export default function LiveTab({ sessionData, showOnlyActive = false, desktopNames = {}, desktopPriorities = {}, windowCounts = {}, desktopApps: _desktopApps = {}, desktopIcons = {}, desktopShortcuts = {}, shortcutErrors = [], searchQuery = '', currentDesktop = null, visitHistory = [], setSessionData, onAction, onSwitch }: { sessionData: any, showOnlyActive?: boolean, desktopNames?: Record<string, string>, desktopPriorities?: Record<string, string>, windowCounts?: Record<string, number>, desktopApps?: Record<string, string[]>, desktopIcons?: Record<string, string[] | string | null>, desktopShortcuts?: Record<string, string | null>, shortcutErrors?: string[], searchQuery?: string, currentDesktop?: string | null, visitHistory?: string[], setSessionData?: (data: any) => void, onAction?: () => void, onSwitch?: (id: string) => void }) {

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
  const [promptConfig, setPromptConfig] = useState<{title: string, defaultValue: string, command: string, isConfirm?: boolean} | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [hoveredDesktop, setHoveredDesktop] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deletingDesktops, setDeletingDesktops] = useState<string[]>([]);

  const [showIconPicker, setShowIconPicker] = useState<string | null>(null);



  const handleSetIcons = (icons: string[]) => {
    if (showIconPicker) {
      const iconsStr = icons.join(',');
      executeMenuCommand(`SET_ICON:${showIconPicker}:${iconsStr}`);
    }
  };

  const { folders, folderNames } = useMemo(() => {
    const f = JSON.parse(JSON.stringify(sessionData?.folders || {}));
    
    if (!f['root']) f['root'] = [];

    // The Empty Aggregator Logic: Move empty desktops to root in the Active tab
    if (showOnlyActive) {
      Object.keys(f).forEach(folderName => {
        if (folderName === 'root') return;
        const remainingDesktops: string[] = [];
        f[folderName].forEach((id: string) => {
          const pureId = id.split('___')[0];
          const isRecentlyCreated = sessionData?.creation_times?.[pureId] && (Date.now() - sessionData.creation_times[pureId] < 30 * 1000);
          const isCurrent = pureId === currentDesktop;
          const hasWindows = (windowCounts[pureId] || 0) > 0;
          
          if (!hasWindows && !isRecentlyCreated && !isCurrent) {
            f['root'].push(id);
          } else {
            remainingDesktops.push(id);
          }
        });
        f[folderName] = remainingDesktops;
      });
    }

    // Auto-sync: Ensure all system desktops are in SOME folder, otherwise inject into root
    Object.keys(desktopNames || {}).forEach(id => {
      let found = false;
      Object.values(f).forEach((desktopList: any) => {
        if (Array.isArray(desktopList) && desktopList.some((d: string) => d.split('___')[0] === id)) found = true;
      });
      if (!found) {
        f['root'] = [...f['root'], `${id}___root`];
      }
    });

    let fNames = Object.keys(f).filter(name => name !== 'root');
    if (sessionData?.folder_order) {
      const orderMap = new Map<string, number>(sessionData.folder_order.map((name: string, i: number) => [name, i]));
      fNames.sort((a, b) => {
        const idxA = orderMap.has(a) ? (orderMap.get(a) as number) : 999;
        const idxB = orderMap.has(b) ? (orderMap.get(b) as number) : 999;
        return idxA - idxB;
      });
    } else {
      fNames.sort((a, b) => a.localeCompare(b));
    }
    if (f['root']) fNames.push('root'); // Root always at bottom

    return { folders: f, folderNames: fNames };
  }, [sessionData?.folders, sessionData?.folder_order, desktopNames, windowCounts, currentDesktop, sessionData?.creation_times, showOnlyActive]);

  const query = (searchQuery || '').toLowerCase().trim();

  // Flattened list for keyboard navigation
  const visibleItems = useMemo(() => {
    const items: { type: 'folder' | 'desktop', id: string, folderName?: string, name?: string }[] = [];
    folderNames.forEach(folderName => {
      const desktops = folders[folderName] || [];

      const activeDesktops = desktops.filter((id: string) => {
        const pureId = id.split('___')[0];
        const isRecentlyCreated = sessionData?.creation_times?.[pureId] && (Date.now() - sessionData.creation_times[pureId] < 30 * 1000);
        const isCurrent = pureId === currentDesktop;
        if (showOnlyActive && folderName !== 'root' && (windowCounts[pureId] || 0) === 0 && !isRecentlyCreated && !isCurrent) return false;
        return true;
      });

      const folderMatches = !query || fuzzyMatch(folderName.toLowerCase(), query);

      const matchingDesktops = activeDesktops.filter((id: string) => {
        if (!query) return true;
        const pureId = id.split('___')[0];
        const name = desktopNames[pureId] || '';
        return fuzzyMatch(name.toLowerCase(), query);
      });

      if (query && !folderMatches && matchingDesktops.length === 0) return;
      if (showOnlyActive && activeDesktops.length === 0) return;

      items.push({ type: 'folder', id: folderName, name: folderName });

      if (expandedFolders.includes(folderName) || query || showOnlyActive) {
        const desktopsToShow = folderMatches && query ? activeDesktops : matchingDesktops;
        
        const sorted = folderName === 'root'
          ? [...desktopsToShow].sort((a, b) => {
              const pA = a.split('___')[0]; const pB = b.split('___')[0];
              const cA = windowCounts[pA] || 0; const cB = windowCounts[pB] || 0;
              if (cA > 0 && cB === 0) return -1;
              if (cA === 0 && cB > 0) return 1;
              const nA = (desktopNames[pA] || '').toLowerCase(); const nB = (desktopNames[pB] || '').toLowerCase();
              const eA = !nA || nA === 'empty'; const eB = !nB || nB === 'empty';
              if (!eA && eB) return -1; if (eA && !eB) return 1;
              return 0;
            })
          : (query || showOnlyActive ? desktopsToShow : desktops);

        sorted.forEach((dId: string) => {
          items.push({ type: 'desktop', id: dId, folderName, name: desktopNames[dId.split('___')[0]] || '' });
        });
      }
    });
    return items;
  }, [folderNames, folders, sessionData?.creation_times, currentDesktop, showOnlyActive, windowCounts, query, desktopNames, expandedFolders]);

  const prevQueryRef = useRef(query);
  const prevDesktopRef = useRef(currentDesktop);

  useEffect(() => {
    const queryChanged = prevQueryRef.current !== query;
    const desktopChanged = prevDesktopRef.current !== currentDesktop;
    
    prevQueryRef.current = query;
    prevDesktopRef.current = currentDesktop;
    
    if (queryChanged || (desktopChanged && !query)) {
      if (!query) {
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
        return;
      }
      
      if (queryChanged) {
        const lowerQuery = query;
        
        const findBestIndex = (targetType: string) => {
          const startsWith = visibleItems.findIndex(item => item.type === targetType && (item.name || '').toLowerCase().startsWith(lowerQuery));
          if (startsWith !== -1) return startsWith;
          const includes = visibleItems.findIndex(item => item.type === targetType && (item.name || '').toLowerCase().includes(lowerQuery));
          if (includes !== -1) return includes;
          const fuzzy = visibleItems.findIndex(item => item.type === targetType && fuzzyMatch((item.name || '').toLowerCase(), lowerQuery));
          return fuzzy;
        };

        let bestIndex = findBestIndex('desktop');
        
        if (bestIndex === -1) {
          const bestFolderIndex = findBestIndex('folder');
          if (bestFolderIndex !== -1) {
            // If the folder matched, we want to highlight the FIRST desktop inside that folder, not the folder itself.
            const folderId = visibleItems[bestFolderIndex].id;
            const firstDesktopIndex = visibleItems.findIndex(item => item.type === 'desktop' && item.folderName === folderId);
            bestIndex = firstDesktopIndex !== -1 ? firstDesktopIndex : bestFolderIndex;
          }
        }
        
        setSelectedIndex(bestIndex !== -1 ? bestIndex : 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, currentDesktop]);

  // Keyboard Navigation: Ctrl + J / K and Ctrl + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack if focused on an input UNLESS it's the global search bar
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable;
      const isGlobalSearch = document.activeElement?.id === 'global-search-input';
      
      if (isInputFocused && !isGlobalSearch) return;

      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        if (visibleItems.length > 0) {
          setSelectedIndex(prev => {
            let i = (prev + 1) % visibleItems.length;
            while (visibleItems[i] && visibleItems[i].type === 'folder' && i !== prev) {
              i = (i + 1) % visibleItems.length;
            }
            return i;
          });
        }
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (visibleItems.length > 0) {
          setSelectedIndex(prev => {
            let i = (prev - 1 + visibleItems.length) % visibleItems.length;
            while (visibleItems[i] && visibleItems[i].type === 'folder' && i !== prev) {
              i = (i - 1 + visibleItems.length) % visibleItems.length;
            }
            return i;
          });
        }
      } else if (e.ctrlKey && e.key === 'Enter' && visibleItems[selectedIndex]) {
        e.preventDefault();
        const item = visibleItems[selectedIndex];
        if (item.type === 'folder') {
          handleDeployAll(item.id);
        } else {
          const pureId = item.id.split("___")[0];
          const hasWindows = (windowCounts[pureId] || 0) > 0;
          if (hasWindows) {
            handleSwitchDesktop(item.id);
          } else {
            executeMenuCommand(`SUMMON:${item.id}`);
          }
        }
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
  }, [visibleItems, selectedIndex, visitHistory, windowCounts]);

  const toggleFolder = (folderName: string) => {
    if (expandedFolders.includes(folderName)) {
      setExpandedFolders(expandedFolders.filter(f => f !== folderName));
    } else {
      setExpandedFolders([...expandedFolders, folderName]);
    }
  };

  const executeMenuCommand = async (command: string) => {
    setContextMenu(null);
    await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" "${command}"`);
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
      await window.electronAPI.moveDesktop(draggedId, destFolder, destination.index);
      if (onAction) onAction();
    }
  };

  const handleSwitchDesktop = (id: string) => {
    if (onSwitch) onSwitch(id);
    const pureId = id.split("___")[0];
    window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${pureId}"`);
  };

  const renderFolder = (folderName: string, index: number, isDraggable: boolean, displayName?: string, isGridView = false) => {
    const label = displayName || folderName;
    const desktops = folders[folderName] || [];

    const query = (searchQuery || '').toLowerCase().trim();

    const activeDesktops = desktops.filter((id: string) => {
      const pureId = id.split('___')[0];
      const isRecentlyCreated = sessionData?.creation_times?.[pureId] && (Date.now() - sessionData.creation_times[pureId] < 30 * 1000);
      const isCurrent = pureId === currentDesktop;
      if (showOnlyActive && folderName !== 'root' && (windowCounts[pureId] || 0) === 0 && !isRecentlyCreated && !isCurrent) return false;
      return true;
    });

    const folderMatches = !query || fuzzyMatch(folderName.toLowerCase(), query);

    const matchingDesktops = activeDesktops.filter((id: string) => {
      if (!query) return true;
      const pureId = id.split('___')[0];
      const name = desktopNames[pureId] || '';
      return fuzzyMatch(name.toLowerCase(), query);
    });

    if (query && !folderMatches && matchingDesktops.length === 0) return null;
    if (showOnlyActive && activeDesktops.length === 0) return null;

    const displayDesktops = folderMatches && query ? activeDesktops : matchingDesktops;
    const isExpanded = expandedFolders.includes(folderName) || !!query || showOnlyActive;

    const folderActive = displayDesktops.filter((id: string) => ((windowCounts || {})[id.split('___')[0]] || 0) > 0).length;
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



    const hasCurrent = sortedDesktops.some((id: string) => id.split("___")[0] === currentDesktop);
    const isSelected = visibleItems[selectedIndex]?.id === folderName;
    const isFocusedFolder = isSelected;

    const innerContent = (providedDraggable?: any) => (
      <div 
        ref={providedDraggable?.innerRef} 
        {...providedDraggable?.draggableProps} 
        className={`${folderName !== 'root' ? "unified-glass-card" : ""} ${hasCurrent ? "has-current" : (folderName !== 'root' && !searchQuery ? "dimmed-folder" : "")} ${isFocusedFolder ? 'nav-focus-folder' : ''}`}
        style={{ 
          ...(providedDraggable?.draggableProps.style || {})
        }}
      >
        <div 
          {...providedDraggable?.dragHandleProps}
          className=""
          onContextMenu={(e) => handleContextMenu(e, 'folder', folderName)}
          onClick={() => toggleFolder(folderName)}
          onMouseEnter={() => {
            setHoveredFolder(folderName);
            const idx = visibleItems.findIndex(i => i.id === folderName);
            if (idx !== -1) setSelectedIndex(idx);
          }}
          onMouseLeave={() => {
            setHoveredFolder(null);
            setSelectedIndex(-1);
          }}
            style={{ 
              display: 'flex',
              padding: '6px 10px',
              background: 'transparent',
              alignItems: 'center',
              color: '#c8d3f5',
              fontWeight: '600',
              fontSize: '13px',
              position: 'relative',
              transition: 'all 0.25s ease',
              borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.03)' : '1px solid transparent'
            }}
          >
          <span className="drag-handle" style={{ marginRight: '10px', display: 'flex', alignItems: 'center', opacity: isFocusedFolder || isExpanded ? 1 : 0.7, transition: 'opacity 0.2s' }}>
            <span className={hasCurrent ? 'folder-has-current-icon' : ''} style={{ display: 'flex' }}>
              {isFocusedFolder && folderName !== 'root' ? <IconGrip color="var(--text-dim)" /> : (isExpanded ? <IconFolderOpen color={hasCurrent ? "var(--accent-blue)" : "var(--text-dim)"} /> : <IconFolder color={hasCurrent ? "var(--accent-blue)" : "var(--text-dim)"} />)}
            </span>
          </span>
          <span style={{ 
            flex: 1, 
            userSelect: 'none', 
            fontSize: '13px', 
            fontWeight: '600',
            letterSpacing: '0.01em',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            minWidth: 0
          }}>{label}</span>
          
          {isFocusedFolder && folderName !== 'root' && (
            <div 
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'New Desktop Name', defaultValue: 'New Desktop', command: `CREATE_LIVE_DESKTOP:${folderName}` }); }}
              style={{ 
                backgroundColor: 'var(--accent-blue)', 
                color: 'var(--bg-primary)', 
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
          {isFocusedFolder && folderName === 'root' && (
            <div 
              className="btn-hover"
              onClick={(e) => { 
                e.stopPropagation(); 
                const rootUuids = (folders['root'] || []).map((id: string) => id.split('___')[0]).join(',');
                executeMenuCommand(`RESET_ROOT_DESKTOPS:${rootUuids}`); 
              }}
              style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                color: 'var(--accent-red)', 
                border: '1px solid var(--accent-red)',
                borderRadius: '4px', 
                padding: '0 8px',
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginRight: '10px',
                fontSize: '11px',
                fontWeight: 'bold',
                gap: '4px'
              }}
              title="Clean All Unassigned"
            >
              <IconTrash size={12} /> Clean All
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

          <div style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>
            {folderActive > 0 && <span style={{ color: 'var(--accent-cyan)', marginRight: '5px', fontWeight: 'bold' }}>{folderActive} active</span>}
            {folderActive > 0 && folderEmpty > 0 && <span style={{ color: 'var(--border-glass)', marginRight: '5px' }}>/</span>}
            {folderEmpty > 0 && <span>{folderEmpty} empty</span>}
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: '2px 8px 6px 8px' }}>
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
                    let historyShortcut: string | null = null;
                    if (visitHistory.length > 0 && pureId === visitHistory[visitHistory.length - 1]) historyShortcut = 'R';
                    else if (visitHistory.length > 1 && pureId === visitHistory[visitHistory.length - 2]) historyShortcut = 'E';
                    else if (visitHistory.length > 2 && pureId === visitHistory[visitHistory.length - 3]) historyShortcut = 'T';
                    const winCount = windowCounts[pureId] || 0;
                    const hasWindows = winCount > 0;
                    const isSelected = visibleItems[selectedIndex]?.id === desktopId;
                    const isHovered = hoveredDesktop === desktopId;
                    const priority = desktopPriorities[pureId] || 'None';
                    const priorityColor = getPriorityColor(priority);
                    const hasScriptAttached = sessionData?.startup_apps?.[pureId] && sessionData.startup_apps[pureId].length > 0;
                    const isDeleting = deletingDesktops.includes(desktopId);
                    const icons = (desktopIcons[pureId] && (Array.isArray(desktopIcons[pureId]) ? desktopIcons[pureId] as string[] : [desktopIcons[pureId] as string])) || [];
                    const shortcut = desktopShortcuts[pureId] || null;
                    const hasShortcutError = shortcutErrors.includes(pureId);

                    return (
                      <DesktopItem
                        key={desktopId}
                        desktopId={desktopId}
                        pureId={pureId}
                        dIndex={dIndex}
                        query={query}
                        displayName={displayName}
                        isActive={isActive}
                        isReturn={historyShortcut === 'R'}
                        historyShortcut={historyShortcut}
                        winCount={winCount}
                        hasWindows={hasWindows}
                        isSelected={isSelected}
                        isHovered={isHovered}
                        priority={priority}
                        priorityColor={priorityColor}
                        hasScriptAttached={hasScriptAttached}
                        isDeleting={isDeleting}
                        icons={icons}
                        shortcut={shortcut}
                        hasShortcutError={hasShortcutError}
                        folderName={folderName}
                        onContextMenu={handleContextMenu}
                        onSwitch={handleSwitchDesktop}
                        onHover={(id) => {
                          setHoveredDesktop(id);
                          if (id) {
                            const idx = visibleItems.findIndex(i => i.id === id);
                            if (idx !== -1) setSelectedIndex(idx);
                          } else {
                            setSelectedIndex(-1);
                          }
                        }}
                        onExecuteCommand={executeMenuCommand}
                        onPrompt={(title, defaultVal, command, isConfirm) => setPromptConfig({ title, defaultValue: defaultVal, command, isConfirm })}
                        onShowIconPicker={setShowIconPicker}
                        hideActionButtons={isGridView}
                      />
                    );
                  })}
                  {providedDroppable.placeholder}
                  {desktops.length === 0 && !query && (
                    <div style={{ padding: '20px', color: 'var(--text-dim)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', opacity: 0.5 }}>
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

  const nonRootFolders = folderNames.filter(f => f !== 'root');

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }} className="custom-scrollbar">
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ padding: '10px' }}>
          
          <Droppable droppableId="board" type="FOLDER">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {nonRootFolders.map((folderName, index) => {
                  const parts = folderName.split('/');
                  const displayName = parts[parts.length - 1];
                  const level = parts.length - 1;
                  const indent = level * 24;

                  return (
                    <div key={folderName} style={{ paddingLeft: `${indent}px`, boxSizing: 'border-box' }}>
                      {renderFolder(folderName, index, true, displayName, false)}
                    </div>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          
          {/* Render Root statically below */}
          {folders['root'] && (
            <div style={{ marginTop: '0' }}>
              {renderFolder('root', 999, false)}
            </div>
          )}
        </div>

      {contextMenu && createPortal(
        <div 
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'folder' ? (
            contextMenu.id === 'root' ? (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                System container for unassigned desktops.
              </div>
            ) : (
            <>
              <div className="menu-item" onClick={() => setPromptConfig({ title: 'New Desktop Name', defaultValue: 'New Desktop', command: `CREATE_LIVE_DESKTOP:${contextMenu.id}` })}>
                <IconPlus size={14} /> Add Desktop to {contextMenu.id}
              </div>

              <div className="menu-item" onClick={() => executeMenuCommand(`REMOVE_LIVE_FOLDER:${contextMenu.id}`)}>
                <IconTrash size={14} /> Delete Folder ({contextMenu.id})
              </div>
            </>
            )
          ) : (
            <>
              <div className="menu-item" onClick={() => executeMenuCommand(`SUMMON:${contextMenu.id}`)}>
                <IconZap size={14} color="var(--accent-purple)" /> Summon
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`CLOSE_WINDOWS:${contextMenu.id}`)}>
                <IconTrash size={14} color="var(--accent-red)" /> Close Windows
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`UNGROUP_DESKTOP:${contextMenu.folderName}:${contextMenu.id}`)}>
                <IconChevronRight size={14} /> Ungroup
              </div>
              <div className="menu-item" onClick={() => setPromptConfig({ title: 'Rename Desktop', defaultValue: desktopNames[contextMenu.id.split('___')[0]] || '', command: `RENAME:${contextMenu.id}` })}>
                <IconPencil size={14} /> Rename
              </div>
              <div className="menu-item" onClick={() => {
                const pureId = contextMenu.id.split('___')[0];
                setPromptConfig({ title: 'Global Shortcut (e.g. Control+Alt+1)', defaultValue: desktopShortcuts[pureId] || '', command: `SET_SHORTCUT:${contextMenu.id}` });
              }}>
                <IconKeyboard size={14} /> Set Hotkey
              </div>
              {desktopShortcuts[contextMenu.id.split('___')[0]] && (
                <div className="menu-item" onClick={() => executeMenuCommand(`SET_SHORTCUT:${contextMenu.id}:`)} style={{ color: 'var(--accent-red)' }}>
                  <IconWipe size={14} /> Clear Hotkey
                </div>
              )}
              <div className="menu-item" onClick={async (e) => {
                e.stopPropagation();
                try {
                  const targetId = contextMenu?.id;
                  
                  if (!targetId) {
                    window.alert("Error: No desktop ID found in context menu!");
                    return;
                  }

                  // Use PromptModal for confirmation to avoid KDE Wayland native dialog bugs
                  setPromptConfig({ 
                    title: 'Are you sure you want to delete desktop?', 
                    defaultValue: '', 
                    command: `CLEAR:${targetId}`,
                    isConfirm: true
                  });
                  setContextMenu(null);
                  
                } catch (err: any) {
                  window.alert(`CRITICAL ERROR during delete: ${err.message}`);
                  console.error(err);
                }
              }} style={{ color: 'var(--accent-red)' }}>
                <IconTrash size={14} /> Delete Desktop
              </div>
              <div className="menu-divider" style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
              <div className="menu-item" onClick={() => { setContextMenu(null); setShowIconPicker(contextMenu.id); }}>
                <IconRocket size={14} /> Change Icon
              </div>
              <div className="menu-item" onClick={() => executeMenuCommand(`SET_ICON:${contextMenu.id}:`)} style={{ color: 'var(--text-dim)' }}>
                <IconUndo size={14} /> Reset Icon
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
          isConfirm={promptConfig.isConfirm}
          onSubmit={async (value) => {
            const finalCommand = promptConfig.isConfirm ? promptConfig.command : `${promptConfig.command}:${value}`;
            executeMenuCommand(finalCommand);
            setPromptConfig(null);
          }}
          onCancel={() => setPromptConfig(null)}
        />
      )}

      {/* MODALS & PORTALS */}
      {showIconPicker && (
        <IconPicker 
          title="Select Desktop Icons"
          currentIcons={(() => {
            const pureId = showIconPicker.split('___')[0];
            const iconData = desktopIcons[pureId];
            return Array.isArray(iconData) ? iconData : (iconData ? [iconData] : []);
          })()}
          onToggle={(icon) => {
            const pureId = showIconPicker.split('___')[0];
            const iconData = desktopIcons[pureId];
            const current = Array.isArray(iconData) ? iconData : (iconData ? [iconData] : []);
            const next = current.includes(icon) 
              ? current.filter(i => i !== icon) 
              : [...current, icon];
            handleSetIcons(next);
          }}
          onClear={() => handleSetIcons([])}
          onClose={() => setShowIconPicker(null)}
        />
      )}
      </DragDropContext>
    </div>
  );
}
