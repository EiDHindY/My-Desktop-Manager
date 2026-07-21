import React, { useState, useEffect, useRef } from 'react';

interface CreateNoteModalProps {
  existingLiveFolders: string[];
  existingTemplates: string[];
  initialCategory: 'general' | 'live' | 'templates';
  initialSubId: string | null;
  onSubmit: (title: string, info: string, category: 'general' | 'live' | 'templates', subId: string | null) => void;
  onCancel: () => void;
}

export default function CreateNoteModal({ existingLiveFolders, existingTemplates, initialCategory, initialSubId, onSubmit, onCancel }: CreateNoteModalProps) {
  const [title, setTitle] = useState('');
  const [info, setInfo] = useState('');
  const [category, setCategory] = useState<'general' | 'live' | 'templates'>(initialCategory);
  
  // Initialize subId based on category logic
  const getInitialSubId = (cat: 'general' | 'live' | 'templates') => {
    if (cat === 'general') return null;
    if (cat === initialCategory && initialSubId) return initialSubId;
    if (cat === 'live') return existingLiveFolders.length > 0 ? existingLiveFolders[0] : '';
    if (cat === 'templates') return existingTemplates.length > 0 ? existingTemplates[0] : '';
    return '';
  };
  
  const [subId, setSubId] = useState<string | null>(getInitialSubId(category));
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const noteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => {
      noteInputRef.current?.focus();
    };
    focusInput();
    setTimeout(focusInput, 50);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          if (!title.trim()) return;
        
        let finalSubId = subId;
        if (category === 'general') finalSubId = null;
        else if (category === 'live') finalSubId = subId?.trim() || 'root';
        else if (category === 'templates') finalSubId = subId?.trim() || 'New Template';
        
        onSubmit(title.trim(), info.trim(), category, finalSubId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [title, info, category, subId, onSubmit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.nativeEvent.stopImmediatePropagation();
    e.nativeEvent.stopPropagation();
  };

  const handleCategoryChange = (newCat: 'general' | 'live' | 'templates') => {
    setCategory(newCat);
    setSubId(getInitialSubId(newCat));
    setIsDropdownOpen(false);
  };

  // List to display for subId select
  const currentList = category === 'live' ? existingLiveFolders : category === 'templates' ? existingTemplates : [];

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
          const finalTitle = title.trim() || 'New Note';
          let finalSubId = subId;
          if (category === 'general') finalSubId = null;
          else if (category === 'live') finalSubId = subId?.trim() || 'root';
          else if (category === 'templates') finalSubId = subId?.trim() || 'New Template';
          onSubmit(finalTitle, info.trim(), category, finalSubId);
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
        }}>Create New Note</h3>

        <style>{`
          .prompt-modal-input::selection {
            background-color: var(--accent-blue);
            color: #ffffff;
          }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Note Title</label>
          <input 
            ref={noteInputRef}
            type="text" 
            value={title}
            placeholder="Title of your note..."
            onChange={(e) => setTitle(e.target.value)}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Note Info</label>
          <textarea 
            value={info}
            placeholder="Details..."
            onChange={(e) => setInfo(e.target.value)}
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
              minHeight: '80px',
              resize: 'vertical',
              transition: 'all 0.3s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
              fontFamily: 'inherit'
            }}
            className="search-input-hover prompt-modal-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Category</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['general', 'live', 'templates'].map(cat => (
              <div 
                key={cat}
                onClick={() => handleCategoryChange(cat as any)}
                style={{
                  flex: 1,
                  padding: '6px',
                  textAlign: 'center',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  border: category === cat ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  backgroundColor: category === cat ? 'rgba(38, 139, 210, 0.2)' : 'rgba(7, 54, 66, 0.4)',
                  color: category === cat ? 'var(--accent-blue)' : 'var(--text-dim)',
                  transition: 'all 0.2s'
                }}
              >
                {cat}
              </div>
            ))}
          </div>
        </div>

        {category !== 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
            <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>
              {category === 'live' ? 'Select Live Folder' : 'Select Template'}
            </label>
            <div 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="search-input-hover"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 33, 43, 0.6)',
                border: '1px solid var(--border-glass)',
                color: '#e0e0e0',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              <span>{subId || (category === 'live' ? 'Choose a folder...' : 'Choose a template...')}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>▼</span>
            </div>
            
            {isDropdownOpen && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: '4px',
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
                {currentList.length === 0 ? (
                  <div style={{ padding: '10px', color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', fontStyle: 'italic' }}>
                    No {category === 'live' ? 'folders' : 'templates'} exist
                  </div>
                ) : currentList.map(item => (
                  <div 
                    key={item}
                    className="interactive-element"
                    onClick={() => {
                      setSubId(item);
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: subId === item ? 'var(--accent-blue)' : 'var(--text-main)',
                      backgroundColor: subId === item ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                      transition: 'background-color 0.1s'
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
            Create Note
          </button>
        </div>
      </form>
    </div>
  );
}
