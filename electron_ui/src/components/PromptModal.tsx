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
    // Trap all keydown events in the capturing phase so the background app NEVER sees them
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation(); // stop bubbling
      e.stopImmediatePropagation(); // stop other listeners on window

      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit(value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [value, onSubmit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Redundant now, but keeps React happy.
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
          onSubmit(value);
        }}
        style={{
        backgroundColor: '#1e2030',
        border: '1px solid #3b4261',
        borderRadius: '12px',
        padding: '20px',
        width: '320px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        <h3 style={{ margin: 0, color: '#7aa2f7', fontSize: '16px' }}>{title}</h3>
        <input 
          ref={inputRef}
          type="text" 
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            backgroundColor: '#24283b',
            border: '1px solid #3b4261',
            color: '#fff',
            outline: 'none',
            fontSize: '14px'
          }}
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button 
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#565f89',
              border: '1px solid #3b4261',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit"
            style={{
              padding: '8px 16px',
              backgroundColor: '#7aa2f7',
              color: '#1a1b26',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
