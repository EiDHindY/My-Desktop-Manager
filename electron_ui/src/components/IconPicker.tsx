import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface IconPickerProps {
  currentIcons: string[];
  onToggle: (icon: string) => void;
  onClear: () => void;
  onClose: () => void;
  title?: string;
}

export default function IconPicker({ currentIcons, onToggle, onClear, onClose, title = "Select Icons" }: IconPickerProps) {
  const [availableIcons, setAvailableIcons] = useState<string[]>([]);

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.listIcons) {
      // @ts-ignore
      window.electronAPI.listIcons().then(setAvailableIcons);
    }
  }, []);

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div className="icon-picker-overlay" onClick={onClose}>
      <div className="icon-picker-content" onClick={e => e.stopPropagation()}>
        <div className="icon-picker-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{currentIcons.length} selected</span>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="icon-grid" style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px' }}>
          <div 
            className="icon-item" 
            onClick={onClear}
            style={{ borderStyle: 'dashed', opacity: currentIcons.length > 0 ? 1 : 0.5 }}
          >
            <div style={{ fontSize: '10px', color: '#565f89', fontWeight: 'bold' }}>Clear All</div>
          </div>
          {availableIcons.map(icon => {
            const isSelected = currentIcons.includes(icon);
            return (
              <div 
                key={icon} 
                className={`icon-item ${isSelected ? 'selected' : ''}`} 
                onClick={() => onToggle(icon)}
                style={{
                  position: 'relative',
                  border: isSelected ? '1px solid var(--accent-blue)' : '1px solid transparent',
                  background: isSelected ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                  borderRadius: '8px',
                  padding: '8px',
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
                  src={`local-icon://${icon}`} 
                  alt={icon} 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    objectFit: 'contain',
                    flexShrink: 0,
                    filter: isSelected ? 'none' : 'grayscale(0.3) opacity(0.8)'
                  }} 
                />
                <span style={{ 
                  fontSize: '10px', 
                  color: isSelected ? 'var(--text-main)' : 'var(--text-dim)', 
                  marginTop: '6px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%'
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
