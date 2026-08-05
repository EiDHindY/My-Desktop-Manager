import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import IconPicker from './IconPicker';
import { ManualIcon } from './Icons';

interface CreateTemplateScriptModalProps {
  existingTemplates: { filename: string, name: string }[];
  onSubmit: (scriptName: string, templateName: string, isNewTemplate: boolean, icon: string | null) => void;
  onCancel: () => void;
}

export default function CreateTemplateScriptModal({ existingTemplates, onSubmit, onCancel }: CreateTemplateScriptModalProps) {
  const [scriptName, setScriptName] = useState('');
  const [templateName, setTemplateName] = useState(existingTemplates.length > 0 ? existingTemplates[0].name : '');
  const [icons, setIcons] = useState<string[]>([]);
  const [showIconPicker, setShowIconPicker] = useState(false);
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = Array.from(modalRef.current.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )) as HTMLElement[];
        
        // Filter out elements that are not visible (e.g., hidden submit button)
        const visibleFocusable = focusableElements.filter(el => el.style.display !== 'none' && el.offsetWidth > 0);
        
        if (visibleFocusable.length === 0) return;

        const firstElement = visibleFocusable[0];
        const lastElement = visibleFocusable[visibleFocusable.length - 1];

        if (e.shiftKey) { // Shift + Tab
          if (document.activeElement === firstElement || document.activeElement === document.body) {
            e.preventDefault();
            lastElement.focus();
          }
        } else { // Tab
          if (document.activeElement === lastElement || document.activeElement === document.body) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredTemplates = existingTemplates.filter(t => {
    const isExactMatch = existingTemplates.some(ex => ex.name.toLowerCase() === templateName.toLowerCase());
    if (isExactMatch) return true; // Show all if currently sitting on a valid selection
    return t.name.toLowerCase().includes(templateName.toLowerCase());
  });

  useEffect(() => {
    const focusInput = () => {
      scriptInputRef.current?.focus();
    };
    focusInput();
    setTimeout(focusInput, 50);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        if (showIconPicker || isDropdownOpen) return;
        if (document.activeElement?.tagName === 'BUTTON') return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!scriptName.trim() || !templateName.trim()) return;
        const isNewTemplate = !existingTemplates.find(t => t.name.toLowerCase() === templateName.toLowerCase().trim());
        onSubmit(scriptName.trim(), templateName.trim(), isNewTemplate, icons.length > 0 ? icons.join(',') : null);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [onCancel, scriptName, templateName, icons, showIconPicker, isDropdownOpen, existingTemplates, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!scriptName.trim() || !templateName.trim()) return;
      
      const isNewTemplate = !existingTemplates.find(t => t.name.toLowerCase() === templateName.toLowerCase().trim());
      onSubmit(scriptName.trim(), templateName.trim(), isNewTemplate, icons.length > 0 ? icons.join(',') : null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }} onClick={onCancel}>
      <div 
        style={{
          width: '90%',
          maxWidth: '400px',
          backgroundColor: 'rgba(0, 43, 54, 0.95)',
          border: '1px solid var(--accent-blue)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(38, 139, 210, 0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
        onClick={(e) => e.stopPropagation()} ref={modalRef}
      >
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px' }}>
            Create Script
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-dim)', fontSize: '12px' }}>
            Press Enter to create, Escape to cancel
          </p>
        </div>

        <style>{`
          .prompt-modal-input::selection {
            background-color: var(--accent-blue);
            color: #ffffff;
          }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Script Name</label>
          <input 
            ref={scriptInputRef}
            type="text" 
            value={scriptName}
            placeholder="e.g. my_script.sh"
            onChange={(e) => setScriptName(e.target.value)}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 10 }} ref={dropdownRef}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Target Template Folder</label>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              value={templateName}
              placeholder="Select or type new folder name"
              onChange={(e) => {
                setTemplateName(e.target.value);
                setIsDropdownOpen(true);
                setFocusedIndex(-1);
              }}
              onFocus={(e) => { setIsDropdownOpen(true); e.target.select(); }}
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
                      const next = prev < filteredTemplates.length - 1 ? prev + 1 : prev;
                      return next === -1 && filteredTemplates.length > 0 ? 0 : next;
                    });
                  } else {
                    setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  
                  let finalFolder = templateName;
                  if (isDropdownOpen && filteredTemplates.length > 0) {
                    finalFolder = focusedIndex >= 0 ? filteredTemplates[focusedIndex].name : filteredTemplates[0].name;
                    setTemplateName(finalFolder);
                    setIsDropdownOpen(false);
                  } else {
                    if (!scriptName.trim() || !finalFolder.trim()) return;
                    const isNewTemplate = !existingTemplates.find(t => t.name.toLowerCase() === finalFolder.toLowerCase().trim());
                    onSubmit(scriptName.trim(), finalFolder.trim(), isNewTemplate, icons.length > 0 ? icons.join(',') : null);
                  }
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
          
          {isDropdownOpen && existingTemplates.length > 0 && (
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
              {filteredTemplates.map((item, index) => {
                const isSelected = templateName.toLowerCase() === item.name.toLowerCase() || index === focusedIndex || (focusedIndex === -1 && index === 0 && templateName.trim() !== '');
                return (
                  <div 
                    key={item.filename}
                    className="interactive-element"
                    onClick={() => {
                      setTemplateName(item.name);
                      setIsDropdownOpen(false);
                      scriptInputRef.current?.focus();
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
                    {item.name}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 'bold' }}>Script Icon (Optional)</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowIconPicker(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowIconPicker(true);
                }
              }}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 33, 43, 0.6)',
                border: '1px solid var(--border-glass)',
                color: '#e0e0e0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
              className="search-input-hover"
            >
              {icons.length > 0 ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {icons.map(ic => <ManualIcon key={ic} icon={ic} size={16} />)}
                </div>
              ) : 'Select Icons...'}
              {icons.length > 0 && <span style={{ marginLeft: '4px' }}>({icons.length} selected)</span>}
            </button>
            {icons.length > 0 && (
              <button 
                onClick={() => setIcons([])}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {showIconPicker && (
          <IconPicker 
            title="Select Initial Icons"
            currentIcons={icons} 
            onToggle={(selectedIcon) => {
              setIcons(prev => 
                prev.includes(selectedIcon) 
                  ? prev.filter(i => i !== selectedIcon) 
                  : [...prev, selectedIcon]
              );
            }}
            onClear={() => setIcons([])}
            onClose={() => setShowIconPicker(false)}
          />
        )}

      </div>
    </div>,
    document.body
  );
}
