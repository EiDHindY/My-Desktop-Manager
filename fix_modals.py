import re

def process_file(filepath, input_ref_name, is_note):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Replace State & Hooks logic
    state_start_idx = content.find("  const [category, setCategory] = useState")
    state_end_idx = content.find("  return createPortal(")
    
    if state_start_idx != -1 and state_end_idx != -1:
        new_state_logic = f"""  const allTargets = [
    {{ label: 'General', category: 'general' as const, subId: null as string | null }},
    ...existingLiveFolders.map(f => ({{ label: f, category: 'live' as const, subId: f }})),
    ...existingTemplates.map(t => ({{ label: t, category: 'templates' as const, subId: t }}))
  ];

  const getInitialTargetLabel = () => {{
    if (initialCategory === 'general') return 'General';
    if (initialSubId) return initialSubId;
    return 'General';
  }};
  
  const [targetText, setTargetText] = useState<string>(getInitialTargetLabel());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const modalRef = useRef<HTMLFormElement>(null);
  const {input_ref_name} = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const targetDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {{
    const handleTab = (e: KeyboardEvent) => {{
      if (e.key === 'Tab' && modalRef.current) {{
        const focusableElements = Array.from(modalRef.current.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )) as HTMLElement[];
        
        const visibleFocusable = focusableElements.filter(el => el.style.display !== 'none' && el.offsetWidth > 0);
        
        if (visibleFocusable.length === 0) return;

        const firstElement = visibleFocusable[0];
        const lastElement = visibleFocusable[visibleFocusable.length - 1];

        if (e.shiftKey) {{
          if (document.activeElement === firstElement || document.activeElement === document.body) {{
            e.preventDefault();
            lastElement.focus();
          }}
        }} else {{
          if (document.activeElement === lastElement || document.activeElement === document.body) {{
            e.preventDefault();
            firstElement.focus();
          }}
        }}
      }}
    }};
    
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }}, []);

  useEffect(() => {{
    const handleClickOutside = (event: MouseEvent) => {{
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(event.target as Node)) {{
        setIsDropdownOpen(false);
      }}
    }};
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }}, []);

  const filteredList = allTargets.filter(item => {{
    const isExactMatch = allTargets.some(ex => ex.label.toLowerCase() === targetText.toLowerCase());
    if (isExactMatch) return true;
    return item.label.toLowerCase().includes(targetText.toLowerCase());
  }});

  useEffect(() => {{
    const focusInput = () => {{
      {input_ref_name}.current?.focus();
    }};
    focusInput();
    setTimeout(focusInput, 50);
  }}, []);

  useEffect(() => {{
    const handleGlobalKeyDown = (e: KeyboardEvent) => {{
      if (e.key === 'Escape') {{
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }}
    }};

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }}, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {{
    if (e.key !== 'Enter') {{
      e.nativeEvent.stopImmediatePropagation();
      e.nativeEvent.stopPropagation();
    }}
  }};

"""
        content = content[:state_start_idx] + new_state_logic + content[state_end_idx:]

    # 2. Replace onSubmit logic
    if is_note:
        old_submit = """        onSubmit={(e) => {
          e.preventDefault();
          const finalTitle = title.trim() || 'New Note';
          let finalSubId = subId;
          if (category === 'general') finalSubId = null;
          else if (category === 'live') finalSubId = subId?.trim() || 'root';
          else if (category === 'templates') finalSubId = subId?.trim() || 'New Template';
          onSubmit(finalTitle, info.trim(), category, finalSubId);
        }}"""
        new_submit = """        onSubmit={(e) => {
          e.preventDefault();
          const finalTitle = title.trim() || 'New Note';
          
          let finalTarget = targetText.trim();
          const matchedTarget = allTargets.find(t => t.label.toLowerCase() === finalTarget.toLowerCase());
          
          let finalCategory: 'general' | 'live' | 'templates' = 'general';
          let finalSubId: string | null = null;
          
          if (matchedTarget) {
            finalCategory = matchedTarget.category;
            finalSubId = matchedTarget.subId;
          } else if (finalTarget && finalTarget.toLowerCase() !== 'general') {
            finalCategory = 'templates';
            finalSubId = finalTarget;
          }
          
          onSubmit(finalTitle, info.trim(), finalCategory, finalSubId);
        }}"""
    else:
        old_submit = """        onSubmit={(e) => {
          e.preventDefault();
          const finalTaskName = taskName.trim() || 'New Task';
          let finalSubId = subId;
          if (category === 'general') finalSubId = null;
          else if (category === 'live') finalSubId = subId?.trim() || 'root';
          else if (category === 'templates') finalSubId = subId?.trim() || 'New Template';
          onSubmit(finalTaskName, category, finalSubId);
        }}"""
        new_submit = """        onSubmit={(e) => {
          e.preventDefault();
          const finalTaskName = taskName.trim() || 'New Task';
          
          let finalTarget = targetText.trim();
          const matchedTarget = allTargets.find(t => t.label.toLowerCase() === finalTarget.toLowerCase());
          
          let finalCategory: 'general' | 'live' | 'templates' = 'general';
          let finalSubId: string | null = null;
          
          if (matchedTarget) {
            finalCategory = matchedTarget.category;
            finalSubId = matchedTarget.subId;
          } else if (finalTarget && finalTarget.toLowerCase() !== 'general') {
            finalCategory = 'templates';
            finalSubId = finalTarget;
          }
          
          onSubmit(finalTaskName, finalCategory, finalSubId);
        }}"""

    content = content.replace(old_submit, new_submit)

    # 3. Replace Dropdowns
    dropdowns_start_idx = content.find("<div style={{ display: 'flex', gap: '16px' }}>")
    dropdowns_end_idx = content.find("<button type=\"submit\" style={{ display: 'none' }} />")
    
    if dropdowns_start_idx != -1 and dropdowns_end_idx != -1:
        new_dropdowns = """<div style={{ display: 'flex', gap: '16px' }}>
          <div ref={targetDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 10, flex: 1 }}>
            <label style={{ color: 'var(--text-dim)', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '4px' }}>
              Target
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                ref={targetInputRef}
                type="text" 
                value={targetText}
                placeholder="Select Target..."
                onChange={(e) => {
                  setTargetText(e.target.value);
                  setIsDropdownOpen(true);
                  setFocusedIndex(-1);
                }}
                onFocus={(e) => {
                  setIsDropdownOpen(true);
                  e.target.select();
                }}
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
                    
                    let finalTargetText = targetText;
                    if (isDropdownOpen && filteredList.length > 0) {
                      finalTargetText = focusedIndex >= 0 ? filteredList[focusedIndex].label : filteredList[0].label;
                    }
                    
                    finalTargetText = finalTargetText.trim() || 'General';
                    const matchedTarget = allTargets.find(t => t.label.toLowerCase() === finalTargetText.toLowerCase());
                    
                    let finalCategory: 'general' | 'live' | 'templates' = 'general';
                    let finalSubId: string | null = null;
                    
                    if (matchedTarget) {
                      finalCategory = matchedTarget.category;
                      finalSubId = matchedTarget.subId;
                    } else if (finalTargetText.toLowerCase() !== 'general') {
                      finalCategory = 'templates';
                      finalSubId = finalTargetText;
                    }
                    """
        if is_note:
            new_dropdowns += "\n                    const finalTitle = title.trim() || 'New Note';\n                    onSubmit(finalTitle, info.trim(), finalCategory, finalSubId);\n"
        else:
            new_dropdowns += "\n                    const finalTaskName = taskName.trim() || 'New Task';\n                    onSubmit(finalTaskName, finalCategory, finalSubId);\n"
        
        new_dropdowns += """                  } else if (e.key === 'Escape') {
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
            
            {isDropdownOpen && allTargets.length > 0 && (
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
                    const exactMatchIndex = filteredList.findIndex(c => c.label.toLowerCase() === (targetText || '').toLowerCase());
                    if (exactMatchIndex !== -1) {
                      effectiveSubIndex = exactMatchIndex;
                    } else if ((targetText || '').trim() !== '') {
                      effectiveSubIndex = 0;
                    }
                  }
                  const isSelected = index === effectiveSubIndex;
                  
                  return (
                    <div 
                      key={item.category + '-' + item.label}
                      className="interactive-element"
                      onClick={() => {
                        setTargetText(item.label);
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
                      {item.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        """
        content = content[:dropdowns_start_idx] + new_dropdowns + content[dropdowns_end_idx:]

    with open(filepath, 'w') as f:
        f.write(content)

process_file('electron_ui/src/components/CreateNoteModal.tsx', 'noteInputRef', True)
process_file('electron_ui/src/components/CreateTaskModal.tsx', 'taskInputRef', False)

print("Done replacing modal code")
