import React, { useState, useEffect } from 'react';
import TiptapEditor from './components/TiptapEditor';
import { IconMinimize, IconPlus, IconMinus, IconType } from './components/Icons';

export default function StandaloneNote({ noteId }: { noteId: string }) {
  const [noteInfo, setNoteInfo] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.3);
  const [spellcheck, setSpellcheck] = useState(false);

  // Load the initial note data
  useEffect(() => {
    const loadNote = async () => {
      const data = await window.electronAPI.readJSON('notes_new.json');
      if (data) {
        let found = false;
        
        // Search in general
        const generalNote = data.general?.find((n: any) => n.id === noteId);
        if (generalNote) {
          setNoteInfo(generalNote.info || '');
          setNoteTitle(generalNote.title || '');
          found = true;
        }

        // Search in live
        if (!found && data.live) {
          for (const key of Object.keys(data.live)) {
            const liveNote = data.live[key]?.find((n: any) => n.id === noteId);
            if (liveNote) {
              setNoteInfo(liveNote.info || '');
              setNoteTitle(liveNote.title || '');
              found = true;
              break;
            }
          }
        }

        // Search in templates
        if (!found && data.templates) {
          for (const key of Object.keys(data.templates)) {
            const tempNote = data.templates[key]?.find((n: any) => n.id === noteId);
            if (tempNote) {
              setNoteInfo(tempNote.info || '');
              setNoteTitle(tempNote.title || '');
              found = true;
              break;
            }
          }
        }
      }
      setLoading(false);
    };
    loadNote();
  }, [noteId]);

  // Save the note back to file when modified
  const handleSave = async (newInfo: string) => {
    setNoteInfo(newInfo);
    
    // Read fresh data, update our note, and write back
    const data = await window.electronAPI.readJSON('notes_new.json');
    if (!data) return;

    let updated = false;

    if (data.general) {
      const idx = data.general.findIndex((n: any) => n.id === noteId);
      if (idx !== -1) {
        data.general[idx].info = newInfo;
        updated = true;
      }
    }

    if (!updated && data.live) {
      for (const key of Object.keys(data.live)) {
        const idx = data.live[key]?.findIndex((n: any) => n.id === noteId);
        if (idx !== -1 && idx !== undefined) {
          data.live[key][idx].info = newInfo;
          updated = true;
          break;
        }
      }
    }

    if (!updated && data.templates) {
      for (const key of Object.keys(data.templates)) {
        const idx = data.templates[key]?.findIndex((n: any) => n.id === noteId);
        if (idx !== -1 && idx !== undefined) {
          data.templates[key][idx].info = newInfo;
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      await window.electronAPI.writeJSON('notes_new.json', data);
    }
  };

  const rootRef = React.useRef<HTMLDivElement>(null);



  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-main)' }}>Loading note...</div>;
  }

  return (
    <div 
      ref={rootRef}
      style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-app)',
      color: 'var(--text-main)',
      overflow: 'hidden',
      borderRadius: '8px', // rounded corners for popout
      border: '1px solid var(--border-glass)',
    }}>
      {/* Draggable Header */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-glass)',
          WebkitAppRegion: 'drag', // Electron drag region
        } as React.CSSProperties}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {noteTitle || 'Note'}
        </div>
        
        {/* Actions - No Drag Area */}
        <div style={{ display: 'flex', gap: '8px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          
          <button 
            onClick={() => setSpellcheck(!spellcheck)}
            style={{ background: 'none', border: 'none', color: spellcheck ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', marginRight: '4px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title={spellcheck ? "Disable Spellcheck" : "Enable Spellcheck"}
          >
            <IconType size={14} />
          </button>

          <button 
            onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Zoom Out"
          >
            <IconMinus size={14} />
          </button>
          
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', display: 'flex', alignItems: 'center', minWidth: '35px', justifyContent: 'center' }}>
            {Math.round(zoomLevel * 100)}%
          </div>

          <button 
            onClick={() => setZoomLevel(Math.min(3.0, zoomLevel + 0.1))}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Zoom In"
          >
            <IconPlus size={14} />
          </button>

          <button 
            onClick={() => window.electronAPI.closePopout(noteId)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', marginLeft: '8px' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Pop In (Return to Main App)"
          >
            <IconMinimize size={16} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div style={{ padding: '12px', zoom: zoomLevel, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TiptapEditor
          value={noteInfo}
          onChange={handleSave}
          onBlur={() => handleSave(noteInfo)} // Ensure save on blur as well
          fullHeight={true}
          spellcheck={spellcheck}
          onHeightChange={(textHeight) => {
            // Calculate window height: text * zoom + header(36) + padding(24) + border(2) + menu(30)
            const newHeight = Math.min(Math.max(150, (textHeight + 35) * zoomLevel + 40 + 24 + 2), 800);
            window.electronAPI.resizePopout(noteId, window.innerWidth, newHeight);
          }}
        />
      </div>
    </div>
  );
}
