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
  
  const [categoryText, setCategoryText] = useState<string>(initialCategory);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categoryFocusedIndex, setCategoryFocusedIndex] = useState(-1);

  const CATEGORIES = ['general', 'live', 'templates'];
  const filteredCategories = CATEGORIES.filter(cat => {
    const isExactMatch = CATEGORIES.some(ex => ex.toLowerCase() === categoryText.toLowerCase());
    if (isExactMatch) return true;
    return cat.toLowerCase().includes(categoryText.toLowerCase());
  });
  
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const modalRef = useRef<HTMLFormElement>(null);

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
  const noteInputRef = useRef<HTMLInputElement>(null);
  const subIdInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const subIdDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (subIdDropdownRef.current && !subIdDropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // List to display for subId select
  const currentList = category === 'live' ? existingLiveFolders : category === 'templates' ? existingTemplates : [];
  
  const filteredList = currentList.filter(item => {
    const isExactMatch = currentList.some(ex => ex.toLowerCase() === (subId || '').toLowerCase());
    if (isExactMatch) return true;
    return item.toLowerCase().includes((subId || '').toLowerCase());
  });

  useEffect(() => {
    const focusInput = () => {
      noteInputRef.current?.focus();
    };
    focusInput();
    setTimeout(focusInput, 50);
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

  const handleCategoryChange = (newCat: 'general' | 'live' | 'templates') => {
    setCategory(newCat);
    setCategoryText(newCat);
    setSubId(getInitialSubId(newCat));
    setIsDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    setFocusedIndex(-1);
    setCategoryFocusedIndex(-1);
    
    if (newCat !== 'general') {
      setTimeout(() => {
        subIdInputRef.current?.focus();
      }, 50);
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
          const finalTitle = title.trim() || 'New Note';
          let finalSubId = subId;
          if (category === 'general') finalSubId = null;
          else if (category === 'live') finalSubId = subId?.trim() || 'root';
          else if (category === 'templates') finalSubId = subId?.trim() || 'New Template';
          onSubmit(finalTitle, info.trim(), category, finalSubId);
        }}
        className="unified-glass-card" ref={modalRef}
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
          <input 
            ref={noteInputRef}
            type="text" 
            value={title}
            placeholder="Note Title"
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
          <textarea 
            value={info}
            placeholder="Note Info"
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

        <div style={{ display: 'flex', gap: '16px' }}>
          <div ref={categoryDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 20, flex: 1 }}>
            <label style={{ color: 'var(--text-dim)', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '4px' }}>Category</label>
            <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              value={categoryText}
              placeholder="Category"
              onChange={(e) => {
                setCategoryText(e.target.value);
                setIsCategoryDropdownOpen(true);
                setCategoryFocusedIndex(-1);
              }}
              onFocus={(e) => {
                setIsCategoryDropdownOpen(true);
                e.target.select();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  if (!isCategoryDropdownOpen) {
                    setIsCategoryDropdownOpen(true);
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    setCategoryFocusedIndex(prev => {
                      const next = prev < filteredCategories.length - 1 ? prev + 1 : prev;
                      return next === -1 && filteredCategories.length > 0 ? 0 : next;
                    });
                  } else {
                    setCategoryFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  
                  let finalCategory = categoryText;
                  if (isCategoryDropdownOpen && filteredCategories.length > 0) {
                    finalCategory = categoryFocusedIndex >= 0 ? filteredCategories[categoryFocusedIndex] : filteredCategories[0];
                  }
                  
                  finalCategory = finalCategory.trim().toLowerCase();
                  if (['general', 'live', 'templates'].includes(finalCategory)) {
                    handleCategoryChange(finalCategory as any);
                  }
                } else if (e.key === 'Escape') {
                  e.nativeEvent.stopImmediatePropagation();
                  e.stopPropagation();
                  setIsCategoryDropdownOpen(false);
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
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
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
          
          {isCategoryDropdownOpen && (
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
              {filteredCategories.map((cat, index) => {
                let effectiveHighlightIndex = categoryFocusedIndex;
                if (effectiveHighlightIndex === -1) {
                  const exactMatchIndex = filteredCategories.findIndex(c => c.toLowerCase() === categoryText.toLowerCase());
                  if (exactMatchIndex !== -1) {
                    effectiveHighlightIndex = exactMatchIndex;
                  } else if (categoryText.trim() !== '') {
                    effectiveHighlightIndex = 0;
                  }
                }
                const isSelected = index === effectiveHighlightIndex;
                
                return (
                  <div 
                    key={cat}
                    className="interactive-element"
                    onClick={() => handleCategoryChange(cat as any)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: isSelected ? 'var(--accent-blue)' : 'var(--text-main)',
                      backgroundColor: isSelected ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                      transition: 'background-color 0.1s',
                      textTransform: 'capitalize',
                      fontWeight: '600'
                    }}
                  >
                    {cat}
                  </div>
                );
              })}
            </div>
          )}
        </div>          <div ref={subIdDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 10, flex: 1 }}>
            <label style={{ color: 'var(--text-dim)', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '4px' }}>
              {category === 'live' ? 'Desktop' : category === 'templates' ? 'Template' : 'Target'}
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                ref={subIdInputRef}
                type="text" 
                value={category === 'general' ? '' : (subId || '')}
                placeholder={category === 'general' ? 'Not required...' : category === 'live' ? 'Select Live Folder' : 'Select Template'}
                disabled={category === 'general'}
                onChange={(e) => {
                  if (category === 'general') return;
                  setSubId(e.target.value);
                  setIsDropdownOpen(true);
                  setFocusedIndex(-1);
                }}
                onFocus={(e) => {
                  if (category !== 'general') {
                    setIsDropdownOpen(true);
                    e.target.select();
                  }
                }}
                onKeyDown={(e) => {
                  if (category === 'general') {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const finalTitle = title.trim() || 'New Note';
                      onSubmit(finalTitle, info.trim(), category, null);
                    }
                    return;
                  }
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
                        const next = prev < filteredList.length - 1 ? prev + 1 : prev;
                        return next === -1 && filteredList.length > 0 ? 0 : next;
                      });
                    } else {
                      setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    e.stopPropagation();
                    
                    let finalFolder = subId || '';
                    if (isDropdownOpen && filteredList.length > 0) {
                      finalFolder = focusedIndex >= 0 ? filteredList[focusedIndex] : filteredList[0];
                    }
                    
                    finalFolder = finalFolder.trim() || (category === 'live' ? 'root' : 'New Template');
                    const finalTitle = title.trim() || 'New Note';
                    onSubmit(finalTitle, info.trim(), category, finalFolder);
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
                  backgroundColor: category === 'general' ? 'rgba(0, 33, 43, 0.3)' : 'rgba(0, 33, 43, 0.6)',
                  border: '1px solid var(--border-glass)',
                  color: '#e0e0e0',
                  outline: 'none',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                  opacity: category === 'general' ? 0.5 : 1,
                  cursor: category === 'general' ? 'not-allowed' : 'text'
                }}
                className={category === 'general' ? "prompt-modal-input" : "search-input-hover prompt-modal-input"}
              />
              {category !== 'general' && (
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
              )}
            </div>
            
            {category !== 'general' && isDropdownOpen && currentList.length > 0 && (
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
                {filteredList.map((item, index) => {
                  let effectiveSubIndex = focusedIndex;
                  if (effectiveSubIndex === -1) {
                    const exactMatchIndex = filteredList.findIndex(c => c.toLowerCase() === (subId || '').toLowerCase());
                    if (exactMatchIndex !== -1) {
                      effectiveSubIndex = exactMatchIndex;
                    } else if ((subId || '').trim() !== '') {
                      effectiveSubIndex = 0;
                    }
                  }
                  const isSelected = index === effectiveSubIndex;
                  
                  return (
                    <div 
                      key={item}
                      className="interactive-element"
                      onClick={() => {
                        setSubId(item);
                        setIsDropdownOpen(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: isSelected ? 'var(--accent-blue)' : 'var(--text-main)',
                        backgroundColor: isSelected ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                        transition: 'background-color 0.1s'
                      }}
                    >
                      {item}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button type="submit" style={{ display: 'none' }} />
      </form>
    </div>
  );
}
