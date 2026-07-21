import React, { useState, useEffect, useRef } from 'react';

interface CreateDesktopModalProps {
  existingFolders: string[];
  onSubmit: (folderName: string, desktopNameWithPriority: string) => void;
  onCancel: () => void;
}

export default function CreateDesktopModal({ existingFolders, onSubmit, onCancel }: CreateDesktopModalProps) {
  const [folderName, setFolderName] = useState('');
  const [desktopName, setDesktopName] = useState('New Desktop');
  const desktopInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => {
      desktopInputRef.current?.focus();
      desktopInputRef.current?.select();
    };
    
    focusInput();
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const folderToUse = folderName.trim() || 'root';
        onSubmit(folderToUse, desktopName);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [folderName, desktopName, onSubmit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.nativeEvent.stopImmediatePropagation();
    e.nativeEvent.stopPropagation();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 10, 15, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(12px)'
    }}>
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          const folderToUse = folderName.trim() || 'root';
          onSubmit(folderToUse, desktopName);
        }}
        className="unified-glass-card"
        style={{
          padding: '28px',
          width: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
        }}>
        <h3 style={{ 
          margin: 0, 
          color: 'var(--accent-blue)', 
          fontSize: '20px', 
          textAlign: 'center', 
          fontWeight: '800',
          letterSpacing: '0.5px'
        }}>Create New Desktop</h3>

        <style>{`
          .prompt-modal-input::selection {
            background-color: var(--accent-blue);
            color: #ffffff;
          }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '13px', fontWeight: 'bold' }}>Desktop Name</label>
          <input 
            ref={desktopInputRef}
            type="text" 
            value={desktopName}
            onChange={(e) => setDesktopName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 33, 43, 0.6)',
              border: '1px solid var(--border-glass)',
              color: '#e0e0e0',
              outline: 'none',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
            className="search-input-hover prompt-modal-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '13px', fontWeight: 'bold' }}>Select Existing Folder</label>
          <select 
            value={existingFolders.includes(folderName) ? folderName : "___NEW___"}
            onChange={(e) => setFolderName(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 33, 43, 0.6)',
              border: '1px solid var(--border-glass)',
              color: '#e0e0e0',
              outline: 'none',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
            className="search-input-hover"
          >
            <option value="___NEW___" disabled>Choose a folder...</option>
            {existingFolders.map(folder => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', margin: '4px 0', fontWeight: 'bold' }}>- OR -</div>
          
          <label style={{ color: 'var(--text-dim)', fontSize: '13px', fontWeight: 'bold' }}>Create New Folder</label>
          <input 
            type="text" 
            value={existingFolders.includes(folderName) ? "" : folderName}
            placeholder="Type new folder name..."
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 33, 43, 0.6)',
              border: '1px solid var(--border-glass)',
              color: '#e0e0e0',
              outline: 'none',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
            className="search-input-hover prompt-modal-input"
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button 
            type="button"
            onClick={onCancel}
            className="interactive-element"
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'rgba(7, 54, 66, 0.5)',
              color: 'var(--text-dim)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '700'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="btn-hover"
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'var(--accent-blue)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '800',
              boxShadow: '0 4px 15px rgba(38, 139, 210, 0.3)'
            }}
          >
            Create Desktop
          </button>
        </div>
      </form>
    </div>
  );
}
