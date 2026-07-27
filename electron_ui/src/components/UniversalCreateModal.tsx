import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconMonitor, IconTerminal, IconList, IconFileText, IconRocket } from './Icons';

interface UniversalCreateModalProps {
  onSelect: (choice: 'desktop' | 'script' | 'task' | 'note' | 'deploy') => void;
  onCancel: () => void;
}

export default function UniversalCreateModal({ onSelect, onCancel }: UniversalCreateModalProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = [
    { id: 'desktop' as const, label: 'Desktop', icon: <IconMonitor size={16} /> },
    { id: 'script' as const, label: 'Script', icon: <IconTerminal size={16} /> },
    { id: 'task' as const, label: 'Tasks', icon: <IconList size={16} /> },
    { id: 'note' as const, label: 'Notes', icon: <IconFileText size={16} /> },
    { id: 'deploy' as const, label: 'Deploy', icon: <IconRocket size={16} /> },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const len = options.length;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev + 2) % len);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev - 2 + len) % len);
      } else if (e.key === 'ArrowRight' || (e.ctrlKey && e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev + 1) % len);
      } else if (e.key === 'ArrowLeft' || (e.ctrlKey && e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedIndex(prev => (prev - 1 + len) % len);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onSelect(options[focusedIndex].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [focusedIndex, onCancel, onSelect, options]);

  return createPortal(
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
    }} onClick={onCancel}>
      <div 
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="unified-glass-card"
        style={{
          padding: '24px',
          width: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255,255,255,0.05)',
          border: '1px solid var(--border-glass)',
          borderRadius: '16px'
        }}
      >
        <h3 style={{ 
          margin: '0', 
          color: 'var(--accent-blue)', 
          fontSize: '18px', 
          textAlign: 'center', 
          fontWeight: '800',
          letterSpacing: '0.5px',
          marginBottom: '8px'
        }}>What do you want to create?</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {options.map((opt, index) => {
            const isFocused = index === focusedIndex;
            return (
              <div
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                onMouseEnter={() => setFocusedIndex(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isFocused ? 'rgba(38, 139, 210, 0.2)' : 'rgba(0, 33, 43, 0.6)',
                  border: `1px solid ${isFocused ? 'var(--accent-blue)' : 'var(--border-glass)'}`,
                  color: isFocused ? '#ffffff' : 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  transform: isFocused ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isFocused ? '0 4px 12px rgba(38, 139, 210, 0.15)' : 'none'
                }}
              >
                <div style={{ color: isFocused ? 'var(--accent-blue)' : 'var(--text-dim)' }}>
                  {opt.icon}
                </div>
                <span style={{ fontSize: '15px', fontWeight: isFocused ? '600' : '500' }}>
                  {opt.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
