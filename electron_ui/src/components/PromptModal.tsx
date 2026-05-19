import React, { useState, useEffect, useRef } from 'react';

interface PromptModalProps {
  title: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({ title, defaultValue, onSubmit, onCancel }: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const isDesktopOp = title.toLowerCase().includes('desktop');

  useEffect(() => {
    const focusInput = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    
    focusInput();
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit(value + (isDesktopOp ? '|None' : ''));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [value, onSubmit, onCancel, isDesktopOp]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.nativeEvent.stopImmediatePropagation();
    e.nativeEvent.stopPropagation();
  };

  const priorityBtns = [
    { label: '⚓ Anchor', value: 'Anchor', color: '#c3e88d' },
    { label: '🔴 High', value: 'High', color: '#ff757f' },
    { label: '🟡 Mid', value: 'Mid', color: '#ffc777' },
    { label: '🔵 Low', value: 'Low', color: '#82aaff' }
  ];

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
          onSubmit(value + (isDesktopOp ? '|None' : ''));
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
        }}>{title}</h3>
        
        <input 
          ref={inputRef}
          type="text" 
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(26, 27, 38, 0.6)',
            border: '2px solid var(--border-glass)',
            color: 'var(--text-main)',
            outline: 'none',
            fontSize: '18px',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}
          className="search-input-hover"
        />

        {isDesktopOp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '5px' }}>
            {priorityBtns.map(btn => (
              <button
                key={btn.value}
                type="button"
                onClick={() => onSubmit(`${value}|${btn.value}`)}
                className="interactive-element"
                style={{
                  padding: '12px',
                  backgroundColor: 'rgba(30, 32, 48, 0.4)',
                  color: btn.color,
                  border: `1px solid ${btn.color}33`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '800',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${btn.color}11`;
                  e.currentTarget.style.borderColor = btn.color;
                  e.currentTarget.style.boxShadow = `0 0 15px ${btn.color}22`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30, 32, 48, 0.4)';
                  e.currentTarget.style.borderColor = `${btn.color}33`;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button 
            type="button"
            onClick={onCancel}
            className="interactive-element"
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: 'rgba(30, 32, 48, 0.5)',
              color: 'var(--text-dim)',
              border: '1px solid var(--border-glass)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '15px',
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
              padding: '12px',
              backgroundColor: 'var(--accent-blue)',
              color: '#1a1b26',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '800',
              boxShadow: '0 4px 15px rgba(122, 162, 247, 0.3)'
            }}
          >
            {isDesktopOp ? 'Set Generic' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
