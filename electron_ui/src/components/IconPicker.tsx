import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconGlobe, IconSearch } from './Icons';

interface IconPickerProps {
  currentIcons: string[];
  onToggle: (icon: string) => void;
  onClear: () => void;
  onClose: () => void;
  title?: string;
}

let globalIconCache: string[] | null = null;
let isFetchingIcons = false;

export default function IconPicker({ currentIcons, onToggle, onClear, onClose, title = "Select Icons" }: IconPickerProps) {
  const [availableIcons, setAvailableIcons] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    // Show cached icons immediately if available for snappy UI
    if (globalIconCache) {
      setAvailableIcons(globalIconCache);
    }
    
    let intervalId: ReturnType<typeof setTimeout>;

    const fetchIcons = () => {
      if (isFetchingIcons) return;
      isFetchingIcons = true;
      if (window.electronAPI && window.electronAPI.listIcons) {
        window.electronAPI.listIcons().then((icons: string[]) => {
          globalIconCache = icons;
          setAvailableIcons(icons);
          isFetchingIcons = false;
        }).catch(() => {
          isFetchingIcons = false;
        });
      } else {
        isFetchingIcons = false;
      }
    };

    fetchIcons(); // initial fetch
    intervalId = setInterval(fetchIcons, 2000); // poll every 2 seconds

    return () => clearInterval(intervalId);
  }, []);

  const filteredIcons = availableIcons.filter(icon => 
    icon.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const items = ['CLEAR_ALL', ...filteredIcons];
      if (items.length === 0) return;

      const COLUMNS = 6;
      let handled = false;
      let newIndex = focusedIndex;
      const isInput = document.activeElement?.tagName === 'INPUT';

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      } else if ((!isInput && e.key === 'ArrowRight') || (e.ctrlKey && e.key === 'l')) {
        e.preventDefault(); e.stopPropagation();
        newIndex = Math.min(Math.max(focusedIndex, 0) + 1, items.length - 1);
        handled = true;
      } else if ((!isInput && e.key === 'ArrowLeft') || (e.ctrlKey && e.key === 'h')) {
        e.preventDefault(); e.stopPropagation();
        newIndex = Math.max(focusedIndex - 1, 0);
        handled = true;
      } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault(); e.stopPropagation();
        newIndex = Math.min(Math.max(focusedIndex, 0) + COLUMNS, items.length - 1);
        handled = true;
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault(); e.stopPropagation();
        newIndex = Math.max(focusedIndex - COLUMNS, 0);
        handled = true;
      } else if (e.key === 'Enter') {
        if (e.ctrlKey) {
          e.preventDefault(); e.stopPropagation();
          onClose();
          return;
        }
        if (document.activeElement?.tagName === 'BUTTON') return;

        if (focusedIndex === 0) {
          e.preventDefault(); e.stopPropagation();
          onClear();
          handled = true;
        } else if (focusedIndex > 0 && items[focusedIndex]) {
          e.preventDefault(); e.stopPropagation();
          onToggle(items[focusedIndex]);
          handled = true;
        }
      }

      if (handled) {
        setFocusedIndex(newIndex);
        setTimeout(() => {
          document.getElementById(`icon-item-${newIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 0);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [filteredIcons, focusedIndex, onToggle, onClear, onClose]);

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  const handleGoOnline = () => {
    if (!searchQuery.trim()) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery.trim() + ' icon')}&tbm=isch`;
    const removeBgUrl = `https://www.remove.bg/`;
    const cmd = `setsid google-chrome --profile-directory="Default" --new-window "${url}" "${removeBgUrl}" </dev/null >/dev/null 2>&1 &`;
    if (window.electronAPI && window.electronAPI.executeCommand) {
      window.electronAPI.executeCommand(cmd);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
    }} onClick={onClose}>
      <div 
        style={{
          width: '90%', maxWidth: '500px', backgroundColor: 'rgba(0, 43, 54, 0.95)',
          border: '1px solid var(--accent-blue)', borderRadius: '12px',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(38, 139, 210, 0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 20px 10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--accent-blue)', fontSize: '16px', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {title}
            </h2>
            <div style={{ color: 'var(--text-dim)', fontSize: '12px', marginTop: '4px' }}>
              {currentIcons.length} selected
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div style={{ padding: '0 12px 12px 12px', display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
              <IconSearch size={14} color="var(--text-dim)" />
            </div>
            <input 
              autoFocus
              type="text" 
              placeholder="Search icons..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                borderRadius: '6px',
                padding: '6px 8px 6px 28px',
                color: 'white',
                fontSize: '13px'
              }}
            />
          </div>
          {searchQuery && (
            <button 
              className="btn-hover"
              onClick={handleGoOnline}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(38, 139, 210, 0.15)',
                color: 'var(--accent-blue)',
                border: '1px solid rgba(38, 139, 210, 0.3)',
                borderRadius: '6px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              <IconGlobe size={14} /> Go Online
            </button>
          )}
        </div>
        <div className="icon-grid" style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px' }}>
          <div 
            id="icon-item-0"
            className={`icon-item ${focusedIndex === 0 ? 'focused' : ''}`} 
            onClick={onClear}
            style={{ 
              borderStyle: 'dashed', 
              opacity: currentIcons.length > 0 ? 1 : 0.5,
              borderColor: focusedIndex === 0 ? 'var(--accent-blue)' : 'var(--border-glass)',
              background: focusedIndex === 0 ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontWeight: 'bold' }}>Clear All</div>
          </div>
          {filteredIcons.map((icon, idx) => {
            const isSelected = currentIcons.includes(icon);
            const globalIndex = idx + 1;
            const isFocused = focusedIndex === globalIndex;
            return (
              <div 
                id={`icon-item-${globalIndex}`}
                key={icon} 
                className={`icon-item ${isSelected ? 'selected' : ''}`} 
                onClick={() => onToggle(icon)}
                style={{
                  position: 'relative',
                  border: isSelected || isFocused ? '1px solid var(--accent-blue)' : '1px solid transparent',
                  background: isSelected ? 'rgba(38, 139, 210, 0.2)' : isFocused ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                  borderRadius: '8px',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                <div style={{ 
                  position: 'absolute', 
                  top: '4px', 
                  right: '4px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: '1px solid var(--border-glass)',
                  background: isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}>
                  {isSelected && <div style={{ width: '6px', height: '6px', background: 'white', borderRadius: '1px' }} />}
                </div>
                <img 
                  src={`local-icon://${encodeURIComponent(icon)}`} 
                  alt={icon} 
                  style={{ 
                    width: '20px', height: '20px', 
                    objectFit: 'contain',
                    flexShrink: 0,
                    filter: isSelected ? 'none' : 'grayscale(0.3) opacity(0.8)'
                  }} 
                />
                <span style={{ 
                  fontSize: '9px', 
                  color: isSelected ? 'var(--text-main)' : 'var(--text-dim)', 
                  marginTop: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%', textAlign: 'center'
                }}>
                  {icon.split('.')[0]}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="btn-hover" 
            onClick={onClose}
            style={{ 
              background: 'var(--aurora-gradient)', 
              color: 'white', 
              border: 'none', 
              padding: '6px 20px', 
              borderRadius: '6px', 
              fontWeight: 'bold',
              fontSize: '12px'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
}
