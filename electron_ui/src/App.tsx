import React, { useEffect, useState, useRef, useCallback } from 'react'
import LiveTab from './components/LiveTab'
import TempsTab from './components/TempsTab'
import NotesTab from './components/NotesTab'
import ChromeTab from './components/ChromeTab'
import PromptModal from './components/PromptModal'

import { IconWipe, IconTrash, IconPlus, IconTerminal, IconImport, IconFolderPlus, IconSquare, IconFileText, IconList, IconLayoutGrid } from './components/Icons'
import './App.css'

function App() {
  const [data, setData] = useState<any>(null)
  const [desktopNames, setDesktopNames] = useState<Record<string, string>>({})
  const [desktopPriorities, setDesktopPriorities] = useState<Record<string, string>>({})
  const [windowCounts, setWindowCounts] = useState<Record<string, number>>({})
  const [desktopApps, setDesktopApps] = useState<Record<string, string[]>>({})
  const [desktopIcons, setDesktopIcons] = useState<Record<string, string[] | null>>({})
  const [desktopShortcuts, setDesktopShortcuts] = useState<Record<string, string>>({})
  const [shortcutErrors, setShortcutErrors] = useState<string[]>([])
  const [currentDesktop, setCurrentDesktop] = useState<string | null>(null)
  const [returnDesktop, setReturnDesktop] = useState<string | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('live')
  // Ref so loadData can read current tab without being recreated
  const activeTabRef = useRef('live')
  const handleSetActiveTab = useCallback((tab: string) => {
    activeTabRef.current = tab
    setActiveTab(tab)
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
  const [promptConfig, setPromptConfig] = useState<{title: string, defaultValue: string, command: string} | null>(null)
  const [isSplitLayout, setIsSplitLayout] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('desktopManager_liveSplitLayout');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('desktopManager_liveSplitLayout', isSplitLayout ? 'true' : 'false');
  }, [isSplitLayout]);

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(true);

  // Load templates separately — they rarely change, no need to fetch every 2.5s
  const loadTemplates = useCallback(async () => {
    // @ts-ignore
    if (window.electronAPI?.listTemplates) {
      // @ts-ignore
      const list = await window.electronAPI.listTemplates();
      setTemplates(list || []);
    }
  }, [])

  const loadData = useCallback((ignoreThrottle = false) => {
    // Skip polling if we just performed an action (to prevent UI flickering/revert)
    if (!ignoreThrottle && Date.now() - lastActionTimeRef.current < 3000) return;

    // SMART POLLING: Only poll if the window is focused (reduces background CPU/IPC lag)
    // We only skip if we already have initial data loaded.
    if (!ignoreThrottle && !document.hasFocus() && dataRef.current) return;

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.readJSON) {
      // @ts-ignore
      Promise.all([
        // @ts-ignore
        window.electronAPI.readJSON('session.json'),
        // @ts-ignore
        window.electronAPI.readJSON('notes.json'),
        // @ts-ignore
        // Only run the expensive window scan when on the Live tab
        window.electronAPI.fetchDesktops(activeTabRef.current === 'live'),
        // @ts-ignore
        window.electronAPI.readJSON('history.json')
      ]).then(([sessionData, notesData, desktopInfo, historyData]) => {
        // SMART SYNC: If we just performed a local switch/action, ignore polling for a moment
        if (!ignoreThrottle && Date.now() - lastActionTimeRef.current < 1500) return;

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
          // @ts-ignore
          window.electronAPI.writeJSON('notes.json', finalNotesData);
        }

        const newData = { session: sessionData, notes: finalNotesData };
        dataRef.current = newData;
        setData(newData)
        setDesktopNames(desktopInfo?.names || {})
        setDesktopPriorities(desktopInfo?.priorities || {})
        setWindowCounts(desktopInfo?.counts || {})
        setDesktopApps(desktopInfo?.apps || {})
        setDesktopIcons(desktopInfo?.icons || {})
        setDesktopShortcuts(desktopInfo?.shortcuts || {})
        setCurrentDesktop(desktopInfo?.current || null)
        setReturnDesktop(historyData?.last_uuid || null)
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
  useEffect(() => { loadData(true); loadTemplates(); }, [])

  // D-Bus Event Listener & Focused Polling
  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onDesktopsUpdated) {
      // @ts-ignore
      window.electronAPI.onDesktopsUpdated((desktopInfo: any) => {
        // SMART SYNC: If we just performed a local action, ignore the dbus echo for a moment
        if (Date.now() - lastActionTimeRef.current < 1500) return;
        
        setDesktopNames(desktopInfo?.names || {})
        setDesktopPriorities(desktopInfo?.priorities || {})
        setWindowCounts(desktopInfo?.counts || {})
        setDesktopApps(desktopInfo?.apps || {})
        setDesktopIcons(desktopInfo?.icons || {})
        setDesktopShortcuts(desktopInfo?.shortcuts || {})
        setCurrentDesktop(desktopInfo?.current || null)
      });
    }

    // Only poll (for window counts) when focused to save CPU
    if (!isFocused) return;
    const interval = setInterval(() => loadData(activeTabRef.current === 'live'), 2500)
    return () => clearInterval(interval)
  }, [loadData, isFocused])

  // Register global shortcuts whenever desktopShortcuts changes
  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.registerShortcuts) {
      const shortcutList = Object.entries(desktopShortcuts)
        .filter(([_, shortcut]) => !!shortcut)
        .map(([uuid, shortcut]) => ({ uuid, shortcut }));
      
      console.log("Syncing global shortcuts:", shortcutList);
      // @ts-ignore
      window.electronAPI.registerShortcuts(shortcutList).then((failures: string[]) => {
        setShortcutErrors(failures || []);
      });
    }
  }, [desktopShortcuts])

  // FAST REFRESH: Fetch new data shortly after an action to make the app feel snappy
  useEffect(() => {
    if (lastActionTime > 0) {
      const timer = setTimeout(() => {
        console.log("Snappy refresh triggered...");
        loadData(true);
      }, 1000); // Increased to 1000ms to ensure slow backend writes (like npx tsx) are finished
      return () => clearTimeout(timer);
    }
  }, [lastActionTime])

  useEffect(() => {
    let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleFocus = () => {
      setIsFocused(true);
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }
      // Debounce: wait 500ms after KDE brings the window forward before firing the
      // window-scan subprocess. This prevents the scan from colliding with the
      // compositor transition, which was the root cause of the freeze.
      focusDebounceTimer = setTimeout(() => loadData(true), 500);
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Circular Tab Navigation - ALWAYS allow these even in inputs if Ctrl is held
      if (e.ctrlKey) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const tabs = ['live', 'notes', 'temps', 'chrome'];
          handleSetActiveTab(tabs[(tabs.indexOf(activeTabRef.current) + 1) % tabs.length]);
          return;
        }
        if (e.key.toLowerCase() === 'q') {
          e.preventDefault();
          const tabs = ['live', 'notes', 'temps', 'chrome'];
          handleSetActiveTab(tabs[(tabs.indexOf(activeTabRef.current) + tabs.length - 1) % tabs.length]);
          return;
        }
      }

      // Clear search on Escape - Allow if in search input or no input
      if (e.key === 'Escape') {
        if (!isInput || document.activeElement === searchInputRef.current) {
          setSearchQuery('')
        }
      }

      // ABSOLUTE GUARD for other keys: if user is typing in any input, ignore
      if (isInput) return;

      // Auto-focus search on any alphanumeric key if not already in an input
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9]$/i.test(e.key)) {
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const handleSwitch = (targetId: string) => {
    setLastActionTime(Date.now())
    const pureTargetId = targetId.split('___')[0]
    
    // Persist return desktop to history.json so it's robust across polls/restarts
    if (currentDesktop && currentDesktop !== pureTargetId) {
      // @ts-ignore
      window.electronAPI.writeJSON('history.json', { last_uuid: currentDesktop });
      setReturnDesktop(currentDesktop)
    }
    
    setCurrentDesktop(pureTargetId) // New target becomes current
    setSearchQuery('') // Clear search so the default live page is clean next time
  }

  const totalActive = Object.values(windowCounts || {}).filter(c => c > 0).length;
  const totalAll = Object.keys(desktopNames || {}).length;
  const totalEmpty = totalAll - totalActive;

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
      border: isFocused ? '2px solid var(--accent-blue)' : '2px solid var(--border-glass)',
      boxShadow: isFocused ? '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(38, 139, 210, 0.3)' : '0 10px 40px rgba(0,0,0,0.4)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '220px', position: 'relative' }}>
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or Command..." 
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                borderRadius: '10px', 
                backgroundColor: 'rgba(0, 33, 43, 0.5)', 
                border: '1px solid var(--border-glass)', 
                color: 'var(--text-main)', 
                outline: 'none', 
                fontSize: '14px',
                transition: 'all 0.3s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                boxSizing: 'border-box'
              }}
              className="search-input-hover"
            />
          </div>

          {activeTab === 'live' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 33, 43, 0.3)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              padding: '2px',
              gap: '2px',
              height: '38px',
              boxSizing: 'border-box'
            }}>
              <button
                onClick={() => setIsSplitLayout(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: !isSplitLayout ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                  color: !isSplitLayout ? 'var(--accent-blue)' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: 0
                }}
                title="Switch to List View"
                className="btn-hover"
              >
                <IconList size={18} />
              </button>
              <button
                onClick={() => setIsSplitLayout(true)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isSplitLayout ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                  color: isSplitLayout ? 'var(--accent-blue)' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: 0
                }}
                title="Switch to Dashboard View"
                className="btn-hover"
              >
                <IconLayoutGrid size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            backgroundColor: 'rgba(42, 161, 152, 0.1)', 
            padding: '4px 10px', 
            borderRadius: '20px',
            border: '1px solid rgba(42, 161, 152, 0.2)'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }}></span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: '800' }}>{totalActive}</span>
            <span style={{ color: 'var(--text-dim)', fontWeight: '500' }}>Active</span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            backgroundColor: 'rgba(7, 54, 66, 0.4)', 
            padding: '4px 10px', 
            borderRadius: '20px',
            border: '1px solid var(--border-glass)'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-dim)' }}></span>
            <span style={{ color: 'var(--text-main)', fontWeight: '800' }}>{totalEmpty}</span>
            <span style={{ color: 'var(--text-dim)', fontWeight: '500' }}>Empty</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Consolidated Power Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 12px', 
          borderBottom: '1px solid var(--border-glass)', 
          backgroundColor: 'rgba(7, 54, 66, 0.4)',
          height: '40px'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['live', 'notes', 'temps', 'chrome'].map(tab => (
                <div 
                key={tab}
                onClick={() => handleSetActiveTab(tab)}
                className="interactive-element"
                  style={{ 
                    padding: '5px 12px', 
                    color: activeTab === tab ? 'var(--accent-blue)' : 'var(--text-dim)',
                    backgroundColor: activeTab === tab ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                    borderRadius: '6px',
                    fontWeight: '800',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    border: activeTab === tab ? '1px solid rgba(38, 139, 210, 0.2)' : '1px solid transparent'
                  }}
              >{tab}</div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeTab === 'temps' ? (
              <>
                <button 
                  className="btn-hover"
                  onClick={() => setPromptConfig({ title: 'New Template Folder', defaultValue: 'New Folder', command: 'CREATE_TEMPLATE' })}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Create New Template Folder"
                >
                  <IconPlus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    // @ts-ignore
                    const folderPath = await window.electronAPI.nativeAction('select-folder');
                    if (folderPath) {
                      // @ts-ignore
                      await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "IMPORT_FOLDER:${folderPath}"`);
                      setLastActionTime(Date.now());
                    }
                  }}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
                  title="Import Folder"
                >
                  <IconImport size={13} /> Import
                </button>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    // @ts-ignore
                    await window.electronAPI.executeCommand(`xdg-open "/home/dod/.local/bin/Scripts/"`);
                  }}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
                  title="Open Scripts Directory"
                >
                  <IconTerminal size={13} /> Scripts
                </button>
              </>
            ) : activeTab === 'notes' ? (
              <>
                <button
                  className="btn-hover"
                  onClick={() => setPromptConfig({ title: 'New Folder Name', defaultValue: 'New Folder', command: 'NOTES_ADD_FOLDER' })}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="New Folder"
                >
                  <IconPlus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey: 'root' } }))}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(133, 153, 0, 0.2)', backgroundColor: 'rgba(133, 153, 0, 0.1)', color: 'var(--accent-green)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                  title="Add Checkbox"
                >
                  <IconSquare size={13} /> Checkbox
                </button>
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey: 'root' } }))}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(108, 113, 196, 0.2)', backgroundColor: 'rgba(108, 113, 196, 0.1)', color: 'var(--accent-purple)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                  title="Add Note"
                >
                  <IconFileText size={13} /> Note
                </button>
              </>
            ) : activeTab === 'live' ? (
              <>
                <button 
                  className="btn-hover"
                  onClick={() => {
                    setPromptConfig({ title: 'New Folder Name', defaultValue: 'New Folder', command: 'ADD_FOLDER' });
                  }}
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="Add Folder"
                >
                  <IconPlus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    // @ts-ignore
                    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "CLEAN_EMPTY"`);
                    setLastActionTime(Date.now());
                  }}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Clean Empty"
                >
                  <IconWipe size={14} /> Clean
                </button>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    if (window.confirm('Clear ALL? This will close windows on all desktops except your current one.')) {
                      // @ts-ignore
                      await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "CLEAR_ALL"`);
                      setLastActionTime(Date.now());
                    }
                  }}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(220, 50, 47, 0.3)', backgroundColor: 'rgba(220, 50, 47, 0.1)', color: 'var(--accent-red)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Clear All"
                >
                  <IconTrash size={14} /> Clear
                </button>
              </>
            ) : null}
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
              {activeTab === 'live' && (
                <LiveTab 
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
                  returnDesktop={returnDesktop}
                  setSessionData={(newSession: any) => setData((prev: any) => ({ ...prev, session: newSession }))}
                  onAction={() => setLastActionTime(Date.now())}
                  onSwitch={handleSwitch}
                  isSplitLayout={isSplitLayout}
                />
              )}
              {activeTab === 'temps' && <TempsTab templates={templates} searchQuery={searchQuery} onAction={() => { setLastActionTime(Date.now()); loadTemplates(); }} />}
              {activeTab === 'notes' && <NotesTab notesData={data?.notes} searchQuery={searchQuery} onAction={() => setLastActionTime(Date.now())} />}
              {activeTab === 'chrome' && <ChromeTab searchQuery={searchQuery} />}

            </>
          )}
        </div>
      </div>
      
      {promptConfig && (
        <PromptModal 
          title={promptConfig.title}
          defaultValue={promptConfig.defaultValue}
          onSubmit={async (value) => {
            if (promptConfig.command === 'NOTES_ADD_FOLDER') {
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
              
              // @ts-ignore
              await window.electronAPI.writeJSON('notes.json', {
                ...currentNotes,
                folders: { ...currentFolders, [folderKey]: [] },
                folder_order: [...currentOrder.filter((k: string) => k !== folderKey), folderKey],
                folder_names: { ...currentNames, [folderKey]: value },
                expanded_folders: [...(currentNotes.expanded_folders || ['root']).filter((k: string) => k !== folderKey), folderKey]
              });
            } else {
              // @ts-ignore
              await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "${promptConfig.command}:${value}"`);
            }
            setLastActionTime(Date.now());
            setPromptConfig(null);
          }}
          onCancel={() => setPromptConfig(null)}
        />
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
