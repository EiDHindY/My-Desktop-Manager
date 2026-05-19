import React, { useEffect, useState } from 'react'
import LiveTab from './components/LiveTab'
import TempsTab from './components/TempsTab'
import NotesTab from './components/NotesTab'
import ChromeTab from './components/ChromeTab'
import PromptModal from './components/PromptModal'

import { IconWipe, IconTrash, IconPlus, IconTerminal, IconImport, IconFolderPlus, IconSquare, IconFileText } from './components/Icons'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [lastActionTime, setLastActionTime] = useState(0)
  const [promptConfig, setPromptConfig] = useState<{title: string, defaultValue: string, command: string} | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const loadData = (ignoreThrottle = false) => {
    // Skip polling if we just performed an action (to prevent UI flickering/revert)
    if (!ignoreThrottle && Date.now() - lastActionTime < 3000) return;

    // SMART POLLING: Only poll if the window is focused (reduces background CPU/IPC lag)
    // We only skip if we already have initial data loaded.
    if (!ignoreThrottle && !document.hasFocus() && data) return;

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.readJSON) {
      console.log("Starting loadData (Promise.all)...");
      // @ts-ignore
      Promise.all([
        // @ts-ignore
        window.electronAPI.readJSON('session.json'),
        // @ts-ignore
        window.electronAPI.readJSON('notes.json'),
        // @ts-ignore
        window.electronAPI.fetchDesktops(),
        // @ts-ignore
        window.electronAPI.listTemplates(),
        // @ts-ignore
        window.electronAPI.readJSON('history.json')
      ]).then(([sessionData, notesData, desktopInfo, templateList, historyData]) => {
        console.log("Data received in frontend:", { sessionData, notesData, desktopInfo });
        
        // SMART SYNC: If we just performed a local switch/action, ignore polling for a moment 
        // to prevent the "state revert" flicker before the backend files have fully updated.
        if (!ignoreThrottle && Date.now() - lastActionTime < 1500) return;

        setData({ session: sessionData, notes: notesData })
        setDesktopNames(desktopInfo?.names || {})
        setDesktopPriorities(desktopInfo?.priorities || {})
        setWindowCounts(desktopInfo?.counts || {})
        setDesktopApps(desktopInfo?.apps || {})
        setDesktopIcons(desktopInfo?.icons || {})
        setDesktopShortcuts(desktopInfo?.shortcuts || {})
        setCurrentDesktop(desktopInfo?.current || null)
        setReturnDesktop(historyData?.last_uuid || null)
        setTemplates(templateList || [])
        setLoading(false)
      }).catch(err => {
        console.error("Error in loadData Promise.all:", err);
        setLoading(false)
      });
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Refresh data periodically to keep in sync with backend
    const interval = setInterval(loadData, 2000)
    return () => clearInterval(interval)
  }, [lastActionTime])

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

  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const handleFocus = () => {
      setIsFocused(true);
      // Only auto-focus search if we aren't already editing something else
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }
    };
    const handleBlur = () => setIsFocused(false);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Circular Tab Navigation - ALWAYS allow these even in inputs if Ctrl is held
      if (e.ctrlKey) {
        if (e.key === 'Tab') {
          e.preventDefault();
          setActiveTab(prev => {
            if (prev === 'live') return 'temps';
            if (prev === 'temps') return 'notes';
            if (prev === 'notes') return 'chrome';
            return 'live';
          });
          return;
        }
        if (e.key.toLowerCase() === 'q') {
          e.preventDefault();
          setActiveTab(prev => {
            if (prev === 'live') return 'chrome';
            if (prev === 'chrome') return 'notes';
            if (prev === 'notes') return 'temps';
            return 'live';
          });
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
  }

  const totalActive = Object.values(windowCounts || {}).filter(c => c > 0).length;
  const totalAll = Object.keys(desktopNames || {}).length;
  const totalEmpty = totalAll - totalActive;

  return (
    <div style={{ 
      color: 'var(--text-main)', 
      fontFamily: 'Outfit, sans-serif',
      backgroundColor: 'rgba(26, 27, 38, 0.85)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      borderRadius: '12px',
      border: isFocused ? '2px solid var(--accent-blue)' : '2px solid var(--border-glass)',
      boxShadow: isFocused ? '0 0 30px rgba(122, 162, 247, 0.2), inset 0 0 20px rgba(122, 162, 247, 0.05)' : '0 10px 40px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      backdropFilter: 'blur(20px)'
    }}>
      {/* Search Bar & Stats */}
      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: 'rgba(30, 32, 48, 0.6)', 
        borderBottom: '1px solid var(--border-glass)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '24px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ flex: 1, maxWidth: '220px', position: 'relative' }}>
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
              backgroundColor: 'rgba(26, 27, 38, 0.5)', 
              border: '1px solid var(--border-glass)', 
              color: 'var(--text-main)', 
              outline: 'none', 
              fontSize: '14px',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
            }}
            className="search-input-hover"
          />
        </div>

        {/* Stats Summary */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            backgroundColor: 'rgba(125, 207, 255, 0.1)', 
            padding: '4px 10px', 
            borderRadius: '20px',
            border: '1px solid rgba(125, 207, 255, 0.2)'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }}></span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: '800' }}>{totalActive}</span>
            <span style={{ color: 'var(--text-dim)', fontWeight: '500' }}>Active</span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            backgroundColor: 'rgba(30, 32, 48, 0.4)', 
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
          backgroundColor: 'rgba(30, 32, 48, 0.4)',
          height: '40px'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['live', 'temps', 'notes', 'chrome'].map(tab => (
                <div 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="interactive-element"
                  style={{ 
                    padding: '5px 12px', 
                    color: activeTab === tab ? 'var(--accent-blue)' : 'var(--text-dim)',
                    backgroundColor: activeTab === tab ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                    borderRadius: '6px',
                    fontWeight: '800',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                    border: activeTab === tab ? '1px solid rgba(122, 162, 247, 0.2)' : '1px solid transparent'
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
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
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
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
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
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
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
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                  title="New Folder"
                >
                  <IconPlus size={16} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey: 'root' } }))}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(158, 206, 106, 0.2)', backgroundColor: 'rgba(158, 206, 106, 0.1)', color: 'var(--accent-green)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                  title="Add Checkbox"
                >
                  <IconSquare size={13} /> Checkbox
                </button>
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey: 'root' } }))}
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(187, 154, 247, 0.2)', backgroundColor: 'rgba(187, 154, 247, 0.1)', color: 'var(--accent-purple)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
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
                  style={{ width: '32px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
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
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', backgroundColor: 'rgba(122, 162, 247, 0.1)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
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
                  style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid rgba(247, 118, 142, 0.3)', backgroundColor: 'rgba(247, 118, 142, 0.1)', color: 'var(--accent-red)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
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
              <div style={{ width: '40px', height: '40px', border: '3px solid rgba(122, 162, 247, 0.1)', borderTop: '3px solid var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
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
                />
              )}
              {activeTab === 'temps' && <TempsTab templates={templates} searchQuery={searchQuery} onAction={() => setLastActionTime(Date.now())} />}
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
          box-shadow: 0 0 15px rgba(122, 162, 247, 0.2), inset 0 2px 4px rgba(0,0,0,0.1) !important;
          background-color: rgba(26, 27, 38, 0.8) !important;
        }
      `}</style>
    </div>
  )

}


export default App
