import React, { useState, useEffect, useRef } from 'react';

interface PromptModalProps {
  title: string;
  description?: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({ title, description, defaultValue, onSubmit, onCancel }: PromptModalProps) {
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
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onSubmit(value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [value, onSubmit, onCancel]);

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
          onSubmit(value);
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

        {description && (
          <p style={{
            margin: '-10px 0 0 0',
            color: 'var(--text-dim)',
            fontSize: '13px',
            textAlign: 'center',
            opacity: 0.8
          }}>
            {description}
          </p>
        )}
        
        <style>{`
          .prompt-modal-input::selection {
            background-color: var(--accent-blue);
            color: #ffffff;
          }
        `}</style>
        <input 
          ref={inputRef}
          type="text" 
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(0, 33, 43, 0.6)',
            border: '2px solid var(--border-glass)',
            color: '#e0e0e0',
            outline: 'none',
            fontSize: '18px',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
          }}
          className="search-input-hover prompt-modal-input"
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button 
            type="button"
            onClick={onCancel}
            className="interactive-element"
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: 'rgba(7, 54, 66, 0.5)',
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
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '800',
              boxShadow: '0 4px 15px rgba(38, 139, 210, 0.3)'
            }}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
