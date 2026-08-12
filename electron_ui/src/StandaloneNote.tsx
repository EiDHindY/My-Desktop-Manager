import React, { useState, useEffect } from 'react';
import TiptapEditor from './components/TiptapEditor';
import { IconMinimize } from './components/Icons';

export default function StandaloneNote({ noteId }: { noteId: string }) {
  const [noteInfo, setNoteInfo] = useState<string>('');
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-main)' }}>Loading note...</div>;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
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
            onClick={() => window.electronAPI.closePopout(noteId)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Pop In (Return to Main App)"
          >
            <IconMinimize size={16} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px' }}>
        <TiptapEditor
          value={noteInfo}
          onChange={handleSave}
          onBlur={() => handleSave(noteInfo)} // Ensure save on blur as well
          fullHeight={true}
        />
      </div>
    </div>
  );
}
