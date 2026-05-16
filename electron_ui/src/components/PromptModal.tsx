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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(4px)'
    }}>
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value + (isDesktopOp ? '|None' : ''));
        }}
        style={{
        backgroundColor: '#1e2030',
        border: '2px solid #5a4a78',
        borderRadius: '16px',
        padding: '24px',
        width: '380px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        <h3 style={{ margin: 0, color: '#a9b1d6', fontSize: '18px', textAlign: 'center', fontWeight: '500' }}>{title}</h3>
        
        <input 
          ref={inputRef}
          type="text" 
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            backgroundColor: '#2f334d',
            border: '2px solid #3b4261',
            color: '#c8d3f5',
            outline: 'none',
            fontSize: '16px',
            textAlign: 'center'
          }}
        />

        {isDesktopOp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '5px' }}>
            {priorityBtns.map(btn => (
              <button
                key={btn.value}
                type="button"
                onClick={() => onSubmit(`${value}|${btn.value}`)}
                style={{
                  padding: '10px',
                  backgroundColor: '#222436',
                  color: btn.color,
                  border: `1px solid ${btn.color}44`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${btn.color}22`;
                  e.currentTarget.style.borderColor = btn.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#222436';
                  e.currentTarget.style.borderColor = `${btn.color}44`;
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button 
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#3b4261',
              color: '#c8d3f5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit"
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#7aa2f7',
              color: '#1a1b26',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {isDesktopOp ? 'Set Generic' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}
