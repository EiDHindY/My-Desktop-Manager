import React, { useState, useEffect, useRef } from 'react';

interface CreateDesktopModalProps {
  existingFolders: string[];
  onSubmit: (folderName: string, desktopNameWithPriority: string) => void;
  onCancel: () => void;
}

export default function CreateDesktopModal({ existingFolders, onSubmit, onCancel }: CreateDesktopModalProps) {
  const [folderName, setFolderName] = useState('');
  const [desktopName, setDesktopName] = useState('New Desktop');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  const filteredFolders = existingFolders.filter(folder => {
    const isExactMatch = existingFolders.some(ex => ex.toLowerCase() === folderName.toLowerCase());
    if (isExactMatch) return true;
    return folder.toLowerCase().includes(folderName.toLowerCase());
  });

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
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') {
      e.nativeEvent.stopImmediatePropagation();
      e.nativeEvent.stopPropagation();
    }
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
          padding: '24px',
          width: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
        }}>
        <h3 style={{ 
          margin: 0, 
          color: 'var(--accent-blue)', 
          fontSize: '18px', 
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
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Desktop Name</label>
          <input 
            ref={desktopInputRef}
            type="text" 
            value={desktopName}
            onChange={(e) => setDesktopName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 33, 43, 0.6)',
              border: '1px solid var(--border-glass)',
              color: '#e0e0e0',
              outline: 'none',
              fontSize: '14px',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
            className="search-input-hover prompt-modal-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 10 }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Target Folder</label>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              value={folderName}
              placeholder="Select or type new folder name"
              onChange={(e) => {
                setFolderName(e.target.value);
                setIsDropdownOpen(true);
                setFocusedIndex(-1);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  if (!isDropdownOpen) {
                    setIsDropdownOpen(true);
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    setFocusedIndex(prev => {
                      const next = prev < filteredFolders.length - 1 ? prev + 1 : prev;
                      return next === -1 && filteredFolders.length > 0 ? 0 : next;
                    });
                  } else {
                    setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  
                  let finalFolder = folderName;
                  if (isDropdownOpen && filteredFolders.length > 0) {
                    finalFolder = focusedIndex >= 0 ? filteredFolders[focusedIndex] : filteredFolders[0];
                  }
                  
                  finalFolder = finalFolder.trim() || 'root';
                  onSubmit(finalFolder, desktopName);
                } else if (e.key === 'Escape') {
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  setIsDropdownOpen(false);
                } else {
                  handleKeyDown(e);
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 30px 10px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 33, 43, 0.6)',
                border: '1px solid var(--border-glass)',
                color: '#e0e0e0',
                outline: 'none',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
              className="search-input-hover prompt-modal-input"
            />
            <div 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: 'var(--text-dim)',
                padding: '4px'
              }}
            >
              ▼
            </div>
          </div>
          
          {isDropdownOpen && existingFolders.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: 'rgba(7, 54, 66, 0.95)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              overflow: 'hidden',
              zIndex: 2010,
              boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(8px)',
              maxHeight: '160px',
              overflowY: 'auto'
            }}>
              {filteredFolders.map((folder, index) => {
                const isSelected = folderName.toLowerCase() === folder.toLowerCase() || index === focusedIndex || (focusedIndex === -1 && index === 0 && folderName.trim() !== '');
                return (
                  <div 
                    key={folder}
                    className="interactive-element"
                    onClick={() => {
                      setFolderName(folder);
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: isSelected ? 'var(--accent-blue)' : 'var(--text-main)',
                      backgroundColor: isSelected ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                      transition: 'background-color 0.1s'
                    }}
                  >
                    {folder}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
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
              fontSize: '13px',
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
              fontSize: '13px',
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
