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
  const [windowCounts, setWindowCounts] = useState<Record<string, number>>({})
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
        // SMART SYNC: If we just performed a local switch/action, ignore polling for a moment 
        // to prevent the "state revert" flicker before the backend files have fully updated.
        if (!ignoreThrottle && Date.now() - lastActionTime < 1500) return;

        setData({ session: sessionData, notes: notesData })
        setDesktopNames(desktopInfo?.names || {})
        setWindowCounts(desktopInfo?.counts || {})
        setCurrentDesktop(desktopInfo?.current || null)
        setReturnDesktop(historyData?.last_uuid || null)
        setTemplates(templateList || [])
        setLoading(false)
      })
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

  // FAST REFRESH: Fetch new data shortly after an action to make the app feel snappy
  useEffect(() => {
    if (lastActionTime > 0) {
      const timer = setTimeout(() => {
        loadData(true);
      }, 400); // 400ms is enough for backend scripts to finish writing to disk
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
      color: '#c8d3f5', 
      fontFamily: 'Inter, sans-serif',
      backgroundColor: 'rgba(34, 36, 54, 0.95)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      borderRadius: '8px',
      border: isFocused ? '2px solid #7aa2f7' : '2px solid #3b4261',
      boxShadow: isFocused ? '0 0 15px rgba(122, 162, 247, 0.3)' : 'none',
      overflow: 'hidden',
      transition: 'all 0.2s ease'
    }}>
      {/* Search Bar & Stats */}
      <div style={{ padding: '8px 12px', backgroundColor: '#1e2030', borderBottom: '1px solid #3b4261', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        <div style={{ flex: 1, maxWidth: '300px' }}>
          <input 
            ref={searchInputRef}
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or Command..." 
            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', backgroundColor: '#292e42', border: '1px solid #3b4261', color: '#fff', outline: 'none', fontSize: '13px' }}
          />
        </div>

        {/* Stats Summary moved here */}
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#7dcfff' }}></span>
            <span style={{ color: '#7dcfff', fontWeight: 'bold' }}>{totalActive}</span>
            <span style={{ color: '#565f89' }}>Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#414868' }}></span>
            <span style={{ color: '#c8d3f5', fontWeight: 'bold' }}>{totalEmpty}</span>
            <span style={{ color: '#565f89' }}>Empty</span>
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
          borderBottom: '1px solid #3b4261', 
          backgroundColor: '#1e2030',
          height: '40px'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['live', 'temps', 'notes', 'chrome'].map(tab => (
                <div 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="interactive-element"
                style={{ 
                  padding: '6px 12px', 
                  color: activeTab === tab ? '#7aa2f7' : '#565f89',
                  backgroundColor: activeTab === tab ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  textTransform: 'capitalize'
                }}
              >{tab}</div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {activeTab === 'temps' ? (
              <>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText('/home/dod/.local/bin/Scripts/');
                    } catch (err) {
                      console.error('Failed to copy text: ', err);
                    }
                    // @ts-ignore
                    const folderPath = await window.electronAPI.nativeAction('select-folder');
                    if (folderPath) {
                      // @ts-ignore
                      await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "IMPORT_FOLDER:${folderPath}"`);
                      setLastActionTime(Date.now());
                    }
                  }}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Import Folder"
                >
                  <IconImport size={12} /> Import
                </button>
                <button 
                  className="btn-hover"
                  onClick={() => setPromptConfig({ title: 'New Template Folder', defaultValue: 'New Folder', command: 'CREATE_TEMPLATE' })}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Create New Template Folder"
                >
                  <IconFolderPlus size={12} /> New Folder
                </button>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    // @ts-ignore
                    await window.electronAPI.executeCommand(`xdg-open "/home/dod/.local/bin/Scripts/"`);
                  }}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Open Scripts Directory"
                >
                  <IconTerminal size={12} /> Scripts
                </button>
              </>
            ) : activeTab === 'notes' ? (
              <>
                <button
                  className="btn-hover"
                  onClick={() => setPromptConfig({ title: 'New Folder Name', defaultValue: 'New Folder', command: 'NOTES_ADD_FOLDER' })}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="New Folder"
                >
                  <IconFolderPlus size={12} /> New Folder
                </button>
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey: 'root' } }))}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#9ece6a', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Add Checkbox"
                >
                  <IconSquare size={12} /> Checkbox
                </button>
                <button
                  className="btn-hover"
                  onClick={() => window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey: 'root' } }))}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#bb9af7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Add Note"
                >
                  <IconFileText size={12} /> Note
                </button>
              </>
            ) : activeTab === 'live' ? (
              <>
                <button 
                  className="btn-hover"
                  onClick={() => {
                    setPromptConfig({ title: 'New Folder Name', defaultValue: 'New Folder', command: 'ADD_FOLDER' });
                  }}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Add Folder"
                >
                  <IconPlus size={12} />
                </button>
                <button 
                  className="btn-hover"
                  onClick={async () => {
                    // @ts-ignore
                    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "CLEAN_EMPTY"`);
                    setLastActionTime(Date.now());
                  }}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #3b4261', backgroundColor: '#292e42', color: '#7aa2f7', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Clean Empty: Automatically remove all empty, unused desktops to keep your workspace tidy."
                >
                  <IconWipe size={12} />
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
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(247, 118, 142, 0.3)', backgroundColor: 'rgba(247, 118, 142, 0.1)', color: '#f7768e', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Clear All: Close all windows and completely reset your workspace (Asks for confirmation first)."
                >
                  <IconTrash size={12} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#1a1b26' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
          ) : (
            <>
              {activeTab === 'live' && (
                <LiveTab 
                  sessionData={data?.session} 
                  desktopNames={desktopNames} 
                  windowCounts={windowCounts}
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
    </div>
  )

}


export default App
