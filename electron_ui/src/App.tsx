import React, { useEffect, useState, useRef, useCallback } from 'react'
import { CLI_PATH } from './constants'
import LiveTab from './components/LiveTab'
import TempsTab from './components/TempsTab'
import NotesTab from './components/NotesTab'
import TasksTab from './components/TasksTab'
import ChromeTab from './components/ChromeTab'
import CompactSwitcher from './components/CompactSwitcher'

import PromptModal from './components/PromptModal'
import CreateDesktopModal from './components/CreateDesktopModal'
import UniversalCreateModal from './components/UniversalCreateModal'
import CreateTaskModal from './components/CreateTaskModal'
import CreateTemplateScriptModal from './components/CreateTemplateScriptModal'
import CreateNoteModal from './components/CreateNoteModal'


import { IconSweeper, IconBomb, IconPlus, IconTerminal, IconImport, IconFolderPlus, IconSquare, IconFileText, IconList, IconLayoutGrid, IconFolderOpen, IconMinus, IconPin } from './components/Icons'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useVisitHistory } from './hooks/useVisitHistory'
import './App.css'

const getThemeColor = (tab: string, type: 'var' | 'hex' = 'var') => {
  const themes: Record<string, { var: string, hex: string }> = {
    temps: { var: 'var(--accent-purple)', hex: '#6c71c4' },
    active: { var: 'var(--accent-cyan)', hex: '#2aa198' },
    notes: { var: 'var(--accent-yellow)', hex: '#b58900' },
    tasks: { var: 'var(--accent-green)', hex: '#859900' },
    chrome: { var: 'var(--accent-orange)', hex: '#cb4b16' }
  };
  return themes[tab]?.[type] || (type === 'var' ? 'var(--accent-blue)' : '#268bd2');
};

function App() {
  const [data, setData] = useState<any>(null)
  const [desktopNames, setDesktopNames] = useState<Record<string, string>>({})
  const [desktopPriorities, setDesktopPriorities] = useState<Record<string, string>>({})
  const [windowCounts, setWindowCounts] = useState<Record<string, number>>({})
  const [desktopApps, setDesktopApps] = useState<Record<string, string[]>>({})
  const [desktopIcons, setDesktopIcons] = useState<Record<string, string[] | null>>({})
  const [desktopShortcuts, setDesktopShortcuts] = useState<Record<string, string>>({})
  const [shortcutErrors, setShortcutErrors] = useState<string[]>([])
  const [pinnedCache, setPinnedCache] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys alone
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      document.body.classList.add('keyboard-nav');
    };
    
    const handleMouseMove = () => {
      if (document.body.classList.contains('keyboard-nav')) {
        document.body.classList.remove('keyboard-nav');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
    };
  }, []);

  const {
    currentDesktop,
    setCurrentDesktop,
    currentDesktopRef,
    returnDesktop,
    setReturnDesktop,
    returnDesktopRef,
    visitHistory,
    setVisitHistory,
    visitHistoryRef,
    prevDesktopRef,
  } = useVisitHistory();
  
  const [isHistoryPaused, setIsHistoryPaused] = useState(false);
  
  const [isCompactSwitcherActive, setIsCompactSwitcherActive] = useState(false);
  const [compactSelectedIndex, setCompactSelectedIndex] = useState(0);
  const compactItemsRef = useRef<any[]>([]);
  const compactIndexRef = useRef(0);

  const [isPinned, setIsPinned] = useState(true); // Default to true because KWin Window Rule forces it on launch
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('tasks')
  // Ref so loadData can read current tab without being recreated
  const activeTabRef = useRef('tasks')
  const lastSection1TabRef = useRef('tasks');
  const lastSection2TabRef = useRef('temps');
  const handleSetActiveTab = useCallback((tab: string) => {
    activeTabRef.current = tab
    setActiveTab(tab)
    if (['active', 'tasks', 'notes'].includes(tab)) {
      lastSection1TabRef.current = tab;
    } else if (['temps', 'chrome'].includes(tab)) {
      lastSection2TabRef.current = tab;
    }
  }, [])
  const [searchQuery, setSearchQuery] = useState('')
  const [lastActionTime, _setLastActionTimeState] = useState(0)
  // Keep a ref so the polling interval can read it without a stale closure
  const lastActionTimeRef = useRef(0)
  const setLastActionTime = useCallback((t: number) => {
    lastActionTimeRef.current = t
    _setLastActionTimeState(t)
  }, [])
  const dataRef = useRef<any>(null)
  const [promptConfig, setPromptConfig] = useState<{title: string, defaultValue: string, command: string, description?: string, isConfirm?: boolean} | null>(null)
  const [showCreateDesktopModal, setShowCreateDesktopModal] = useState(false)
  const [showUniversalCreate, setShowUniversalCreate] = useState(false)
  const [showGlobalCreateTask, setShowGlobalCreateTask] = useState(false)
  const [showGlobalCreateScript, setShowGlobalCreateScript] = useState(false)
  const [showGlobalCreateNote, setShowGlobalCreateNote] = useState(false)

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(true);
  const [chromeProfileCount, setChromeProfileCount] = useState(0);

  const handleTogglePin = async (id: string) => {
    if (window.electronAPI && window.electronAPI.togglePinDesktop) {
      await window.electronAPI.togglePinDesktop(id);
      setPinnedCache(prev => ({ ...prev, [id]: !prev[id] }));
    }
  };

  const handleSwitch = useCallback((targetId: string) => {
    setLastActionTime(Date.now())
    const pureTargetId = targetId.split('___')[0]
    setCurrentDesktop(pureTargetId) // New target becomes current
    setSearchQuery('') // Clear search so the default live page is clean next time
  }, [setLastActionTime, setCurrentDesktop, setSearchQuery]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.fetchChromeProfiles) {
      window.electronAPI.fetchChromeProfiles().then((data: any[]) => {
        setChromeProfileCount(data ? data.length : 0);
      }).catch(console.error);
    }
  }, []);



  // Load templates separately — they rarely change, no need to fetch every 2.5s
  const loadTemplates = useCallback(async () => {
    if (window.electronAPI?.listTemplates) {
      const list = await window.electronAPI.listTemplates();
      setTemplates(list || []);
    }
  }, [])

  const loadData = useCallback((ignoreThrottle = false, scanWindows = true) => {
    // Skip polling if we just performed an action (to prevent UI flickering/revert)
    if (!ignoreThrottle && Date.now() - lastActionTimeRef.current < 3000) return;

    // SMART POLLING: Only poll if the window is focused (reduces background CPU/IPC lag)
    // We only skip if we already have initial data loaded.
    if (!ignoreThrottle && !document.hasFocus() && dataRef.current) return;
    if (window.electronAPI && window.electronAPI.readJSON) {
      Promise.all([
        window.electronAPI.readJSON('session.json'),
        window.electronAPI.readJSON('notes.json'),
        window.electronAPI.readJSON('tasks.json'),
        window.electronAPI.readJSON('notes_new.json'),
        window.electronAPI.fetchDesktops(scanWindows),
        window.electronAPI.readJSON('history.json')
      ]).then(([sessionData, notesData, tasksData, notesDataNew, desktopInfo, historyData]) => {
        // SMART SYNC: If we just performed a local switch/action, ignore polling for a moment
        // Must match the outer throttle (3000ms) to avoid race where Promise resolves
        // just as the cooldown expires but backend hasn't finished writing
        if (!ignoreThrottle && Date.now() - lastActionTimeRef.current < 3000) return;

        // Auto-migrate legacy notes format (version 2 hierarchy) to the new flat structure
        let finalNotesData = notesData;
        if (notesData && notesData.hierarchy && !notesData.folders) {
          const newFolders: Record<string, any[]> = {};
          const newOrder: string[] = [];
          const newNames: Record<string, string> = {};
          const newExpanded: string[] = notesData.expanded_folders || ['root'];

          notesData.hierarchy.forEach((folder: any) => {
            const fKey = folder.name; // e.g., "pm_177..."
            newOrder.push(fKey);
            
            // Extract human readable name from ID (e.g. pm_1778527461732 -> pm)
            let displayName = fKey;
            if (displayName !== 'root') {
              const match = displayName.match(/^(.*)_\d{13}$/);
              if (match) displayName = match[1];
            }
            newNames[fKey] = displayName;
            
            newFolders[fKey] = (folder.children || []).map((child: any) => ({
              id: child.id,
              type: child.type === 'note' ? 'note' : 'checkbox',
              text: child.text || child.name || 'Untitled',
              checked: child.checked || false,
              content: child.details || ''
            }));
          });

          if (!newFolders['root']) {
            newFolders['root'] = [];
            newOrder.push('root');
            newNames['root'] = 'General';
          }

          finalNotesData = {
            folders: newFolders,
            folder_order: newOrder,
            folder_names: newNames,
            expanded_folders: newExpanded
          };
          
          // Auto-save migrated format
          window.electronAPI.writeJSON('notes.json', finalNotesData);
        }

        const newData = { session: sessionData, notes: finalNotesData, tasks: tasksData, notes_new: notesDataNew };
        dataRef.current = newData;
        setData(newData)
        setDesktopNames(desktopInfo?.names || {})
        setDesktopPriorities(desktopInfo?.priorities || {})
        if (desktopInfo?.counts !== undefined) {
          setWindowCounts(desktopInfo.counts)
        }
        setDesktopApps(desktopInfo?.apps || {})
        setDesktopIcons(desktopInfo?.icons || {})
        setDesktopShortcuts(desktopInfo?.shortcuts || {})
        setPinnedCache(desktopInfo?.pinned || {})
        setCurrentDesktop(desktopInfo?.current || null)
        setReturnDesktop(historyData?.last_uuid || null)
        const historyList = historyData?.history || [];
        setVisitHistory(historyList)
        if (!prevDesktopRef.current && desktopInfo?.current) {
           prevDesktopRef.current = desktopInfo.current;
        }
        setLoading(false)
      }).catch(err => {
        console.error("Error in loadData Promise.all:", err);
        setLoading(false)
      });
    } else {
      setLoading(false)
    }
  }, [])

  // Initial load on mount — load data + templates together
  useEffect(() => { loadData(true, true); loadTemplates(); }, [])

  // D-Bus Event Listener & Focused Polling
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onDesktopsUpdated) {
      window.electronAPI.onDesktopsUpdated((desktopInfo: any) => {
        // SMART SYNC: If we just performed a local action, ignore the dbus echo for a moment
        // Must match the outer throttle (3000ms) to prevent partial data from D-Bus
        // stomping over optimistic UI updates during deploy/create operations
        if (Date.now() - lastActionTimeRef.current < 3000) return;
        
        setDesktopNames(desktopInfo?.names || {})
        setDesktopPriorities(desktopInfo?.priorities || {})
        if (desktopInfo?.counts !== undefined) {
          setWindowCounts(desktopInfo.counts)
        }
        setDesktopApps(desktopInfo?.apps || {})
        setDesktopIcons(desktopInfo?.icons || {})
        setDesktopShortcuts(desktopInfo?.shortcuts || {})
        setPinnedCache(desktopInfo?.pinned || {})
        setCurrentDesktop(desktopInfo?.current || null)
      });
    }

    // Only poll (for window counts) when focused to save CPU
    if (!isFocused) return;
    const interval = setInterval(() => loadData(activeTabRef.current === 'active', false), 2500)
    return () => clearInterval(interval)
  }, [loadData, isFocused])

  // Register global shortcuts whenever desktopShortcuts changes
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.registerShortcuts) {
      const shortcutList = Object.entries(desktopShortcuts)
        .filter(([_, shortcut]) => !!shortcut)
        .map(([uuid, shortcut]) => ({ uuid, shortcut }));
      
      console.log("Syncing global shortcuts:", shortcutList);
      window.electronAPI.registerShortcuts(shortcutList).then((failures: string[]) => {
        setShortcutErrors(failures || []);
      });
    }
  }, [desktopShortcuts])

  
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onCompactScroll((direction) => {
      setIsCompactSwitcherActive(true);
      
      // Compute items
      const folders = dataRef.current?.session?.folders || {};
      const creationTimes = dataRef.current?.session?.creation_times || {};
      const items: any[] = [];
      const dNames = dataRef.current?.names || desktopNames;
      const dIcons = dataRef.current?.icons || desktopIcons;
      
      Object.entries(folders).forEach(([folderName, ids]) => {
         if (Array.isArray(ids)) {
           ids.forEach(fullId => {
             const id = fullId.split('___')[0];
             const name = dNames[id];
             const count = windowCounts[id] || 0;
             const isRecentlyCreated = creationTimes[id] && (Date.now() - creationTimes[id] < 30 * 1000);

             if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
               if (count > 0 || isRecentlyCreated || id === currentDesktop) {
                 if (!items.find(i => i.id === id)) {
                   items.push({ id, name, folder: folderName, icons: dIcons[id] });
                 }
               }
             }
           });
         }
      });
      
      items.sort((a, b) => {
        if (a.id === currentDesktop) return -1;
        if (b.id === currentDesktop) return 1;

        const idxA = visitHistoryRef.current.indexOf(a.id);
        const idxB = visitHistoryRef.current.indexOf(b.id);
        
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        
        return a.name.localeCompare(b.name);
      });
      
      compactItemsRef.current = items;
      
      const length = items.length;
      if (length <= 1) return; // No other items to switch to

      let next = compactIndexRef.current;
      const step = direction > 0 ? -1 : 1;
      
      if (next === -1) {
        next = step === 1 ? 1 : length - 1;
      } else {
        next += step;
        if (next < 1) next = length - 1;
        if (next >= length) next = 1;
      }
      
      compactIndexRef.current = next;
      setCompactSelectedIndex(next);
    });

    window.electronAPI.onCompactConfirm(() => {
      setIsCompactSwitcherActive(false);
      const items = compactItemsRef.current;
      const selected = items[compactIndexRef.current];
      if (selected) {
        handleSwitch(selected.id);
      }
    });
  }, [desktopNames, desktopIcons, windowCounts, currentDesktop]);

  // FAST REFRESH: Fetch new data shortly after an action to make the app feel snappy
  useEffect(() => {
    if (lastActionTime > 0) {
      const timer = setTimeout(() => {
        console.log("Snappy refresh triggered...");
        loadData(true);
        loadTemplates();
      }, 2000); // 2s delay to ensure slow backend writes (npx tsx + file I/O) are finished
      return () => clearTimeout(timer);
    }
  }, [lastActionTime])

  useEffect(() => {
    let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFocus = () => {
      setIsFocused(true);
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !(document.activeElement as HTMLElement)?.isContentEditable) {
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }
      // Debounce: wait 500ms after KDE brings the window forward before firing the
      // window-scan subprocess. This prevents the scan from colliding with the
      // compositor transition, which was the root cause of the freeze.
      focusDebounceTimer = setTimeout(() => { loadData(true); loadTemplates(); }, 500);
    };
    const handleBlur = () => {
      setIsFocused(false);
      if (focusDebounceTimer) clearTimeout(focusDebounceTimer);
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (focusDebounceTimer) clearTimeout(focusDebounceTimer);
    };
  }, [loadData]);

  const isModalOpen = showCreateDesktopModal || showUniversalCreate || showGlobalCreateTask || showGlobalCreateScript || showGlobalCreateNote || !!promptConfig;

  useKeyboardShortcuts({
    activeTabRef,
    handleSetActiveTab,
    setShowUniversalCreate,
    setShowCreateDesktopModal,
    returnDesktopRef,
    currentDesktopRef,
    setLastActionTime,
    setCurrentDesktop,
    setSearchQuery,
    setVisitHistory,
    visitHistoryRef,
    setIsPinned,
    searchInputRef,
    isModalOpen
  });




  const totalActive = Object.values(windowCounts || {}).filter(c => c > 0).length;
  const totalAll = Object.keys(desktopNames || {}).length;
  const totalEmpty = totalAll - totalActive;
  const totalScripts = templates.filter(t => !t.isDivider).reduce((acc, t) => acc + (t.tasks ? t.tasks.length : 0), 0);

  const activeFolder = (() => {
    let folder: string | null = null;
    if (data?.session?.folders && currentDesktop) {
      Object.entries(data.session.folders).forEach(([folderName, desktops]: [string, any]) => {
        if (Array.isArray(desktops) && desktops.some(d => d.split('___')[0] === currentDesktop)) {
          folder = folderName;
        }
      });
    }
    return folder;
  })();

  const totalUnfinishedTasks = (() => {
    let count = 0;
    
    if (activeFolder) {
      if (data?.tasks?.live?.[activeFolder]) {
        count += data.tasks.live[activeFolder].filter((t: any) => !t.checked).length;
      }
      if (data?.tasks?.templates?.[activeFolder]) {
        count += data.tasks.templates[activeFolder].filter((t: any) => !t.checked).length;
      }
    } else {
      if (data?.tasks?.general) {
        count += data.tasks.general.filter((t: any) => !t.checked).length;
      }
    }
    
    return count;
  })();

  const totalNotes = (() => {
    let count = 0;
    
    if (activeFolder) {
      if (data?.notes_new?.live?.[activeFolder]) {
        count += data.notes_new.live[activeFolder].length;
      }
      if (data?.notes_new?.templates?.[activeFolder]) {
        count += data.notes_new.templates[activeFolder].length;
      }
    } else {
      if (data?.notes_new?.general) {
        count += data.notes_new.general.length;
      }
    }
    
    return count;
  })();

  return (
    <div style={{ 
      color: 'var(--text-main)', 
      fontFamily: 'Outfit, sans-serif',
      backgroundColor: 'rgba(0, 33, 43, 0.85)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      borderRadius: '12px',
      border: isFocused ? `2px solid ${getThemeColor(activeTab)}` : '2px solid var(--border-glass)',
      boxShadow: isFocused ? `inset 0 0 0 1px ${getThemeColor(activeTab, 'hex')}1A` : 'none',
      overflow: 'hidden',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      backdropFilter: 'blur(20px)'
    }}>
      {/* Search Bar & Stats */}
      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: 'rgba(7, 54, 66, 0.6)', 
        borderBottom: '1px solid var(--border-glass)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '24px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '100px' }}>
          <div style={{ width: '100%', maxWidth: '220px', position: 'relative' }}>
            <input 
              id="global-search-input"
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (searchQuery.startsWith('/')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    const query = searchQuery.slice(1).toLowerCase();
                    const tabs = ['temps', 'active', 'notes', 'tasks', 'chrome'];
                    const matchedTab = tabs.find(t => t.includes(query));
                    if (matchedTab) {
                      handleSetActiveTab(matchedTab);
                      setSearchQuery('');
                    }
                  } else {
                    // Let the event bubble up to the active tab to execute the selected item,
                    // then clear the search query so it's wiped clean for next time.
                    setTimeout(() => setSearchQuery(''), 0);
                  }
                }
              }}
              placeholder="Search or Command..." 
              style={{ 
                width: '100%', 
                padding: '6px 10px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(0, 33, 43, 0.5)', 
                border: '1px solid var(--border-glass)', 
                color: 'var(--text-main)', 
                outline: 'none', 
                fontSize: '13px',
                transition: 'all 0.3s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                boxSizing: 'border-box'
              }}
              className="search-input-hover"
            />
          </div>
        </div>

        {/* Actions and Stats Summary */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', height: '28px' }}>


          {/* Action Buttons (Tasks and Notes Tabs) */}
          {(activeTab === 'tasks' || activeTab === 'notes') && (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="btn-hover"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent(`${activeTab}-create-new`));
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: `${getThemeColor(activeTab, 'hex')}1A`, color: getThemeColor(activeTab), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, transition: 'all 0.3s ease' }}
                  title={`New ${activeTab === 'tasks' ? 'Task' : 'Note'} (Ctrl + N)`}
                >
                  <IconPlus size={16} />
                </button>
              </div>
              {/* Divider */}
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-glass)' }} />
            </>
          )}
          
          {/* Action Buttons (Only for Temps Tab) */}
          {activeTab === 'temps' && (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="btn-hover"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('temps-create-new'));
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid rgba(38, 139, 210, 0.2)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Create Template Script (Ctrl + N)"
                >
                  <IconPlus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    const uniqueName = `Divider ${Date.now()}`;
                    await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" "CREATE_TEMPLATE_DIVIDER:${uniqueName}"`);
                    setLastActionTime(Date.now());
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid rgba(133, 153, 0, 0.2)', backgroundColor: 'rgba(133, 153, 0, 0.1)', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Add Group Divider"
                >
                  <IconMinus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    const folderPath = await window.electronAPI.nativeAction('select-folder');
                    if (folderPath) {
                      await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" "IMPORT_FOLDER:${folderPath}"`);
                      setLastActionTime(Date.now());
                      loadTemplates();
                    }
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Import Folder"
                >
                  <IconImport size={16} />
                </button>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    await window.electronAPI.executeCommand(`xdg-open "/home/dod/.local/bin/Scripts/"`);
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Open Scripts Directory"
                >
                  <IconFolderOpen size={16} />
                </button>
              </div>
              {/* Divider */}
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-glass)' }} />
            </>
          )}
          
          {/* Action Buttons (Only for Active Tab) */}
          {activeTab === 'active' && (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="btn-hover"
                  onClick={() => {
                    setShowCreateDesktopModal(true);
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: `${getThemeColor(activeTab, 'hex')}1A`, color: getThemeColor(activeTab), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, transition: 'all 0.3s ease' }}
                  title="New (Ctrl + N)"
                >
                  <IconPlus size={16} />
                </button>
              </div>

              {/* Divider */}
              <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-glass)' }} />
            </>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
            <div 
              title="Active Desktops"
              style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              backgroundColor: 'rgba(42, 161, 152, 0.1)', 
              padding: '2px 8px', 
              borderRadius: '20px',
              border: '1px solid rgba(42, 161, 152, 0.2)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }}></span>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: '800' }}>{totalActive}</span>
            </div>
            <div 
              title="Empty Desktops"
              style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              backgroundColor: 'rgba(7, 54, 66, 0.4)', 
              padding: '2px 8px', 
              borderRadius: '20px',
              border: '1px solid var(--border-glass)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-dim)' }}></span>
              <span style={{ color: 'var(--text-main)', fontWeight: '800' }}>{totalEmpty}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Consolidated Power Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 8px', 
          borderBottom: '1px solid var(--border-glass)', 
          backgroundColor: isFocused ? `${getThemeColor(activeTab, 'hex')}15` : 'rgba(88, 110, 117, 0.1)', // Very subtle tint of the active tab color
          height: '32px',
          transition: 'background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['temps', 'active', 'tasks', 'notes', 'chrome']
              .filter(tab => !searchQuery.startsWith('/') || tab.includes(searchQuery.slice(1).toLowerCase()))
              .map(tab => (
                <div 
                key={tab}
                onClick={() => handleSetActiveTab(tab)}
                className={`interactive-element ${activeTab === tab && isFocused ? 'tab-active-focused' : ''}`}
                  style={{ 
                    '--tab-color': getThemeColor(tab),
                    '--tab-bg': `${getThemeColor(tab, 'hex')}1A`,
                    padding: '4px 10px', 
                    color: activeTab === tab ? (isFocused ? getThemeColor(tab) : 'var(--text-main)') : 'var(--text-dim)',
                    backgroundColor: activeTab === tab ? (isFocused ? 'transparent' : 'rgba(255, 255, 255, 0.05)') : 'transparent',
                    borderRadius: '6px',
                    fontWeight: '800',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    border: activeTab === tab ? (isFocused ? `1px solid transparent` : '1px solid var(--border-glass)') : '1px solid transparent',
                    position: 'relative'
                  } as React.CSSProperties}
              >
                {tab}
                {tab === 'temps' && totalScripts > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}> [{totalScripts}]</span>
                )}
                {tab === 'active' && totalActive > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}> [{totalActive}]</span>
                )}
                {tab === 'tasks' && totalUnfinishedTasks > 0 && (
                  <span style={{ color: 'var(--accent-yellow)' }}> [{totalUnfinishedTasks}]</span>
                )}
                {tab === 'notes' && totalNotes > 0 && (
                  <span style={{ color: 'var(--accent-cyan)' }}> [{totalNotes}]</span>
                )}
                {tab === 'chrome' && chromeProfileCount > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}> [{chromeProfileCount}]</span>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Action Buttons are in the Top Bar */}
          </div>
        </div>

        <div className="main-content-area" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid rgba(38, 139, 210, 0.1)', borderTop: '3px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <span style={{ color: 'var(--text-dim)', fontWeight: '600', letterSpacing: '1px' }}>SYNCHRONIZING WORKSPACE...</span>
            </div>
          ) : (
            <>
              {activeTab === 'active' && (
                <LiveTab 
                  showOnlyActive={true}
                  sessionData={data?.session} 
                  desktopNames={desktopNames} 
                  desktopPriorities={desktopPriorities}
                  windowCounts={windowCounts}
                  desktopApps={desktopApps}
                  desktopIcons={desktopIcons}
                  desktopShortcuts={desktopShortcuts}
                  shortcutErrors={shortcutErrors}
                  searchQuery={searchQuery}
                  currentDesktop={currentDesktop}
                  visitHistory={visitHistory}
                  setSessionData={(newSession: any) => setData((prev: any) => ({ ...prev, session: newSession }))}
                  onAction={() => setLastActionTime(Date.now())}
                  onSwitch={handleSwitch}
                  pinnedCache={pinnedCache}
                  onTogglePin={handleTogglePin}
                />
              )}
              {activeTab === 'temps' && <TempsTab templates={templates} setTemplates={setTemplates} searchQuery={searchQuery} onAction={() => { setLastActionTime(Date.now()); loadTemplates(); }} setPromptConfig={setPromptConfig} setActiveTab={handleSetActiveTab} />}
              <div style={{ display: activeTab === 'notes' ? 'flex' : 'none', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <NotesTab isActive={activeTab === 'notes'} notesData={data?.notes_new} sessionData={data?.session} templates={templates} searchQuery={searchQuery} currentFolder={activeFolder} onAction={() => setLastActionTime(Date.now())} />
              </div>
              <div style={{ display: activeTab === 'tasks' ? 'flex' : 'none', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <TasksTab 
                  isActive={activeTab === 'tasks'} 
                  tasksData={data?.tasks} 
                  sessionData={data?.session} 
                  templates={templates} 
                  searchQuery={searchQuery} 
                  currentFolder={activeFolder}
                  onAction={() => setLastActionTime(Date.now())} 
                />
              </div>
              {activeTab === 'chrome' && <ChromeTab searchQuery={searchQuery} />}

            </>
          )}
        </div>
        <button 
          className="btn-hover"
          onClick={async () => {
            if (window.electronAPI) {
              await window.electronAPI.nativeAction('toggle-pin');
              setIsPinned(prev => !prev);
            }
          }}
          style={{ 
            position: 'fixed',
            bottom: '0',
            right: '0',
            zIndex: 9999,
            width: '28px', 
            height: '28px', 
            borderTopLeftRadius: '6px', 
            borderBottomRightRadius: '0',
            borderBottomLeftRadius: '0',
            borderTopRightRadius: '0',
            border: '1px solid var(--border-glass)', 
            backgroundColor: !isPinned ? 'rgba(38, 139, 210, 0.2)' : 'rgba(0, 33, 43, 0.8)', 
            backdropFilter: 'blur(10px)',
            color: !isPinned ? 'var(--accent-blue)' : 'var(--text-dim)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flexShrink: 0, 
            padding: 0, 
            transition: 'all 0.3s ease' 
          }}
          title="Toggle Keep Above Others (Windows+Z)"
        >
          <IconPin size={14} fill={!isPinned ? 'currentColor' : 'none'} />
        </button>
      </div>
      
      {isCompactSwitcherActive && (
        <CompactSwitcher 
          items={compactItemsRef.current} 
          selectedIndex={compactSelectedIndex} 
        />
      )}

      {promptConfig && (
        <PromptModal 
          title={promptConfig.title}
          description={promptConfig.description}
          defaultValue={promptConfig.defaultValue}
          isConfirm={promptConfig.isConfirm}
          onSubmit={async (value) => {
            if (promptConfig.command === 'NOTES_ADD_FOLDER' || promptConfig.command === 'NOTES_ADD_DIVIDER') {
              const folderKey = value.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
              
              // SAFETY CHECK: Ensure we have valid notes data before attempting to update.
              // If data.notes is missing its core structure, abort to prevent overwriting with defaults.
              if (!data?.notes || !data.notes.folders) {
                console.error("Abort: Notes data is missing or corrupted. Cannot add folder safely.");
                alert("Error: Could not add folder because the notes data is currently unavailable or corrupted. Please restart the app.");
                return;
              }

              const currentNotes = data.notes;
              const currentFolders = currentNotes.folders;
              const currentOrder = currentNotes.folder_order || Object.keys(currentFolders);
              const currentNames = currentNotes.folder_names || {};
              const currentIsDivider = currentNotes.folder_is_divider || {};
              await window.electronAPI.writeJSON('notes.json', {
                ...currentNotes,
                folders: { ...currentFolders, [folderKey]: [] },
                folder_order: [...currentOrder.filter((k: string) => k !== folderKey), folderKey],
                folder_names: { ...currentNames, [folderKey]: value },
                folder_is_divider: { ...currentIsDivider, [folderKey]: promptConfig.command === 'NOTES_ADD_DIVIDER' },
                expanded_folders: [...(currentNotes.expanded_folders || ['root']).filter((k: string) => k !== folderKey), folderKey]
              });
            } else {
              const finalCommand = promptConfig.isConfirm 
                ? promptConfig.command 
                : `${promptConfig.command}:${value}`;
              await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" "${finalCommand}"`);
            }
            setLastActionTime(Date.now());
            loadTemplates();
            setPromptConfig(null);
          }}
          onCancel={() => setPromptConfig(null)}
        />
      )}

      {showCreateDesktopModal && (
        <CreateDesktopModal
          existingFolders={Object.keys(data?.session?.folders || {}).filter(folderId => {
            const desktops = data?.session?.folders[folderId] || [];
            return desktops.some((id: string) => {
              const pureId = id.split('___')[0];
              const hasWindows = (windowCounts[pureId] || 0) > 0;
              const creationTime = data?.session?.creation_times?.[pureId] || 0;
              const isRecentlyCreated = Date.now() - creationTime < 5 * 60 * 1000;
              return hasWindows || isRecentlyCreated;
            });
          })}
          onSubmit={async (folderName, desktopNameWithPriority) => {
            setShowCreateDesktopModal(false);
            await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" "CREATE_LIVE_DESKTOP:${folderName}:${desktopNameWithPriority}"`);
            setLastActionTime(Date.now());
          }}
          onCancel={() => setShowCreateDesktopModal(false)}
        />
      )}

      {showUniversalCreate && (
        <UniversalCreateModal
          onSelect={(choice) => {
            setShowUniversalCreate(false);
            if (choice === 'desktop') {
              setShowCreateDesktopModal(true);
            } else if (choice === 'script') {
              setShowGlobalCreateScript(true);
            } else if (choice === 'task') {
              setShowGlobalCreateTask(true);
            } else if (choice === 'note') {
              setShowGlobalCreateNote(true);
            } else if (choice === 'deploy') {
              handleSetActiveTab('temps');
            }
          }}
          onCancel={() => setShowUniversalCreate(false)}
        />
      )}

      {showGlobalCreateScript && (
        <CreateTemplateScriptModal
          existingTemplates={templates.filter(t => !t.isDivider).map(t => ({ filename: t.filename, name: t.name }))}
          onSubmit={async (scriptName, templateName, isNewTemplate, icon) => {
            setShowGlobalCreateScript(false);
            const command = isNewTemplate 
              ? `CREATE_TEMPLATE_SCRIPT:"${templateName}":"${scriptName}":${icon ? `"${icon}"` : 'null'}:true`
              : `CREATE_TEMPLATE_SCRIPT:"${templateName}":"${scriptName}":${icon ? `"${icon}"` : 'null'}:false`;
            await window.electronAPI.executeCommand(`npx tsx "${CLI_PATH}" '${command}'`);
            setLastActionTime(Date.now());
            loadTemplates();
          }}
          onCancel={() => setShowGlobalCreateScript(false)}
        />
      )}

      {showGlobalCreateTask && (
        <CreateTaskModal
          existingLiveFolders={Object.keys(data?.session?.folders || {}).filter(k => k !== 'root').concat('root')}
          existingTemplates={templates.filter(t => !t.isDivider).map(t => t.name)}
          initialCategory="general"
          initialSubId={null}
          onSubmit={(taskName, category, subId) => {
            setShowGlobalCreateTask(false);
            const newTask = {
              id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              text: taskName,
              checked: false
            };
            const newData = { ...(data?.tasks || { general: [], live: {}, templates: {} }) };
            if (category === 'general') {
              newData.general = [...newData.general, newTask];
            } else if (category === 'live' && subId) {
              if (!newData.live) newData.live = {};
              if (!newData.live[subId]) newData.live[subId] = [];
              newData.live[subId] = [...newData.live[subId], newTask];
            } else if (category === 'templates' && subId) {
              if (!newData.templates) newData.templates = {};
              if (!newData.templates[subId]) newData.templates[subId] = [];
              newData.templates[subId] = [...newData.templates[subId], newTask];
            }
            window.electronAPI.writeJSON('tasks.json', newData);
            setLastActionTime(Date.now());
          }}
          onCancel={() => setShowGlobalCreateTask(false)}
        />
      )}

      {showGlobalCreateNote && (
        <CreateNoteModal
          existingLiveFolders={Object.keys(data?.session?.folders || {}).filter(k => k !== 'root').concat('root')}
          existingTemplates={templates.filter(t => !t.isDivider).map(t => t.name)}
          initialCategory="general"
          initialSubId={null}
          onSubmit={(title, info, category, subId) => {
            setShowGlobalCreateNote(false);
            const newNote = {
              id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              title,
              info
            };
            const newData = { ...(data?.notes_new || { general: [], live: {}, templates: {}, folders: {}, folder_order: [] }) };
            if (category === 'general') {
              newData.general = [...newData.general, newNote];
            } else if (category === 'live' && subId) {
              if (!newData.live) newData.live = {};
              if (!newData.live[subId]) newData.live[subId] = [];
              newData.live[subId] = [...newData.live[subId], newNote];
            } else if (category === 'templates' && subId) {
              if (!newData.templates) newData.templates = {};
              if (!newData.templates[subId]) newData.templates[subId] = [];
              newData.templates[subId] = [...newData.templates[subId], newNote];
            }
            window.electronAPI.writeJSON('notes_new.json', newData);
            setLastActionTime(Date.now());
          }}
          onCancel={() => setShowGlobalCreateNote(false)}
        />
      )}

      {isHistoryPaused && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 33, 43, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: '16px 24px',
          borderRadius: '12px',
          border: '1px solid var(--accent-blue)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Quick Jump</div>
          <div style={{ color: 'var(--accent-blue)', fontSize: '18px', fontWeight: 'bold' }}>
            {desktopNames[currentDesktop || ''] || 'Loading...'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .search-input-hover:focus {
          border-color: var(--accent-blue) !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05) !important;
          background-color: rgba(0, 33, 43, 0.8) !important;
        }
      `}</style>
    </div>
  )

}


export default App
