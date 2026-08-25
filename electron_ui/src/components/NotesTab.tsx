import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { IconFolder, IconFolderOpen, IconPlus, IconCheck, IconSquare, IconChevronRight, IconChevronDown, IconTrash, IconGrip, IconPencil, IconInbox, IconRadio, IconLayers, IconCopy, IconMinus, IconSlash, IconExternalLink } from './Icons';
import CreateNoteModal from './CreateNoteModal';
import PromptModal from './PromptModal';
import DataSidebar from './DataSidebar';
import TiptapEditor from './TiptapEditor';

interface Note {
  id: string;
  title: string;
  info: string;
}

interface NotesData {
  general: Note[];
  live: Record<string, Note[]>;
  templates: Record<string, Note[]>;
  expanded_categories: string[];
}

export default function NotesTab({ isActive, notesData, sessionData, templates, searchQuery = '', onAction, currentFolder = null }: { isActive: boolean, notesData: any, sessionData: any, templates: any[], searchQuery?: string, onAction?: () => void, currentFolder?: string | null }) {
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const [data, setData] = useState<NotesData>({
    general: [],
    live: {},
    templates: {},
    expanded_categories: ['general', 'live', 'templates']
  });

  const [activeCategory, setActiveCategory] = useState<'general' | 'live' | 'templates'>('general');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  useEffect(() => {
    if (isActive) {
      if (currentFolder) {
        const isTemplate = templates?.some(t => t.name === currentFolder);
        if (isTemplate) {
          setActiveCategory('templates');
          setActiveSubId(currentFolder);
          setIsSidebarOpen(false);
          return;
        }
      }
      setActiveCategory('general');
      setActiveSubId(null);
      setIsSidebarOpen(false);
    }
  }, [isActive, currentFolder, templates]);
  const [newNoteText, setNewNoteText] = useState('');
  
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteInfo, setEditingNoteInfo] = useState('');
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(-1);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const newNoteInputRef = useRef<HTMLInputElement>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => setSelectedIndex(0), [searchQuery]);

  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        if (newNoteInputRef.current) {
          newNoteInputRef.current.focus();
        }
      }, 100);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleCreateNew = () => setShowCreateModal(true);
    window.addEventListener('notes-create-new', handleCreateNew as EventListener);
    return () => window.removeEventListener('notes-create-new', handleCreateNew as EventListener);
  }, [isActive]);
  
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setIsSidebarOpen(true);
        window.dispatchEvent(new CustomEvent('focus-global-search'));
      } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
    };
    
    const handleToggleSidebar = () => {
      setIsSidebarOpen(prev => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('toggle-sidebar', handleToggleSidebar);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-sidebar', handleToggleSidebar);
    };
  }, [isActive]);
  
  useEffect(() => {
    if (!isActive) return;
    const handleClickOutside = (e: MouseEvent) => {
      const container = document.getElementById('notes-tab-container');
      if (container && !container.contains(e.target as Node)) {
        return;
      }
      if (editingNoteId) {
        const el = document.getElementById(`editing-note-${editingNoteId}`);
        if (el && !el.contains(e.target as Node)) {
          handleSaveEdit(editingNoteId);
        }
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isActive, editingNoteId, data, editingNoteTitle, editingNoteInfo, activeCategory, activeSubId]);

  useEffect(() => {
    if (!isActive) return;
    const handleGlobalTyping = (e: any) => {
      // If the sidebar is closed and we are NOT actively navigating notes
      if (!isSidebarOpen && selectedNoteIndex === -1) {
        e.preventDefault(); // Stop App.tsx from focusing the global search bar
        if (newNoteInputRef.current) {
          newNoteInputRef.current.focus();
        }
      }
      // If we ARE navigating notes (selectedNoteIndex !== -1), we still prevent default
      // so it doesn't focus the global search bar in App.tsx, but we DON'T focus the new note input.
      else if (!isSidebarOpen && selectedNoteIndex !== -1) {
        e.preventDefault();
      }
    };
    window.addEventListener('global-typing-intercept', handleGlobalTyping);
    return () => window.removeEventListener('global-typing-intercept', handleGlobalTyping);
  }, [isActive, isSidebarOpen, selectedNoteIndex]);

  
  useEffect(() => {
    if (notesData) {
      setData({
        general: notesData.general || [],
        live: notesData.live || {},
        templates: notesData.templates || {},
        expanded_categories: notesData.expanded_categories || ['general', 'live', 'templates']
      });
    }
  }, [notesData]);

  const writeData = async (newData: NotesData) => {
    const writeNotes = async (newData: any) => {
    return await window.electronAPI.writeJSON('notes_new.json', newData);
  };
    setData(newData);
    await writeNotes(newData);
    if (onAction) onAction();
  };

  const toggleCategory = (cat: string) => {
    const newExpanded = data.expanded_categories.includes(cat)
      ? data.expanded_categories.filter(c => c !== cat)
      : [...data.expanded_categories, cat];
    writeData({ ...data, expanded_categories: newExpanded });
  };

  const handleAddNote = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newNoteText.trim()) {
      const newNote: Note = {
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: newNoteText.trim(),
        info: ''
      };

      const newData = { ...data };
      if (activeCategory === 'general') {
        newData.general = [...newData.general, newNote];
      } else if (activeCategory === 'live' && activeSubId) {
        if (!newData.live[activeSubId]) newData.live[activeSubId] = [];
        newData.live[activeSubId] = [...newData.live[activeSubId], newNote];
      } else if (activeCategory === 'templates' && activeSubId) {
        if (!newData.templates[activeSubId]) newData.templates[activeSubId] = [];
        newData.templates[activeSubId] = [...newData.templates[activeSubId], newNote];
      }

      writeData(newData);
      setNewNoteText('');
      setEditingNoteId(newNote.id);
      setEditingNoteTitle(newNote.title);
      setEditingNoteInfo(newNote.info || '');
      setTimeout(() => {
        document.getElementById(`note-textarea-${newNote.id}`)?.focus();
      }, 50);
    }
  };



  const handleDeleteNote = (noteId: string) => {
    const newData = { ...data };
    let notesList: Note[] = [];
    if (activeCategory === 'general') {
      notesList = newData.general;
    } else if (activeCategory === 'live' && activeSubId) {
      notesList = newData.live[activeSubId] || [];
    } else if (activeCategory === 'templates' && activeSubId) {
      notesList = newData.templates[activeSubId] || [];
    }
    const filtered = notesList.filter(t => t.id !== noteId);
    if (activeCategory === 'general') {
      newData.general = filtered;
    } else if (activeCategory === 'live' && activeSubId) {
      newData.live[activeSubId] = filtered;
    } else if (activeCategory === 'templates' && activeSubId) {
      newData.templates[activeSubId] = filtered;
    }
    writeData(newData);
  };

  const handleSaveEdit = (noteId: string, collapse = true, infoOverride?: string) => {
    if (!editingNoteTitle.trim()) return;
    const newData = { ...data };
    let notesList: Note[] = [];
    if (activeCategory === 'general') {
      notesList = newData.general;
    } else if (activeCategory === 'live' && activeSubId) {
      notesList = newData.live[activeSubId] || [];
    } else if (activeCategory === 'templates' && activeSubId) {
      notesList = newData.templates[activeSubId] || [];
    }
    const noteIndex = notesList.findIndex(t => t.id === noteId);
    if (noteIndex !== -1) {
      const finalInfo = infoOverride !== undefined ? infoOverride : editingNoteInfo;
      notesList[noteIndex] = { ...notesList[noteIndex], title: editingNoteTitle.trim(), info: finalInfo };
      writeData(newData);
    }
    if (collapse) setEditingNoteId(null);
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;
    
    if (source.droppableId !== destination.droppableId) return;
    if (source.index === destination.index) return;

    const newData = { ...data };
    let notesList: Note[] = [];
    
    if (activeCategory === 'general') {
      notesList = [...newData.general];
    } else if (activeCategory === 'live' && activeSubId) {
      notesList = [...(newData.live[activeSubId] || [])];
    } else if (activeCategory === 'templates' && activeSubId) {
      notesList = [...(newData.templates[activeSubId] || [])];
    }

    const [removed] = notesList.splice(source.index, 1);
    notesList.splice(destination.index, 0, removed);

    if (activeCategory === 'general') {
      newData.general = notesList;
    } else if (activeCategory === 'live' && activeSubId) {
      newData.live[activeSubId] = notesList;
    } else if (activeCategory === 'templates' && activeSubId) {
      newData.templates[activeSubId] = notesList;
    }

    writeData(newData);
  };

  const getActiveNotes = () => {
    let notes: Note[] = [];
    if (activeCategory === 'general') notes = data.general || [];
    if (activeCategory === 'live' && activeSubId) notes = data.live[activeSubId] || [];
    if (activeCategory === 'templates' && activeSubId) notes = data.templates[activeSubId] || [];
    
    if (searchQuery && !isSidebarOpen) {
      notes = notes.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t.info && t.info.toLowerCase().includes(searchQuery.toLowerCase())));
    }
    return notes;
  };

  const getUnfinishedCount = (cat: 'general' | 'live' | 'templates', subId?: string) => {
    let notes: Note[] = [];
    if (cat === 'general') notes = data.general || [];
    else if (cat === 'live' && subId) notes = data.live[subId] || [];
    else if (cat === 'templates' && subId) notes = data.templates[subId] || [];
    return notes.length;
  };

  const activeNotes = getActiveNotes();

  const selectCategory = (category: 'general' | 'live' | 'templates', subId: string | null) => {
    setActiveCategory(category);
    setActiveSubId(subId);
    setTimeout(() => {
      if (newNoteInputRef.current) {
        newNoteInputRef.current.focus();
      }
    }, 10);
  };

  
  // Compute visible items for keyboard navigation highlighting
  const visibleItems: { type: 'general' | 'live' | 'templates', id: string | null }[] = [];
  if (!isSidebarOpen || !searchQuery || 'general notes'.includes(searchQuery.toLowerCase())) {
    visibleItems.push({ type: 'general', id: null });
  }
  
  const templateItems = templates ? templates.filter(t => !t.isDivider).filter(t => isSidebarOpen && searchQuery ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) : true) : [];
  templateItems.sort((a, b) => getUnfinishedCount('templates', b.name) - getUnfinishedCount('templates', a.name));
  templateItems.forEach(t => visibleItems.push({ type: 'templates', id: t.name }));

  useEffect(() => {
    if (!isActive || !isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent | React.KeyboardEvent) => {
      // Don't hijack if focused on an input UNLESS it's the global search bar
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable;
      const isGlobalSearch = document.activeElement?.id === 'global-search-input';
      
      if (isInputFocused && !isGlobalSearch) return;

      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % visibleItems.length);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + visibleItems.length) % visibleItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = visibleItems[selectedIndex];
        if (item) {
          selectCategory(item.type, item.id);
          setIsSidebarOpen(false);
          window.dispatchEvent(new CustomEvent('clear-search-query'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown as any);
    return () => window.removeEventListener('keydown', handleKeyDown as any);
  }, [isActive, isSidebarOpen, selectedIndex, visibleItems]);

  // Reset selected note when active notes change
  useEffect(() => {
    setSelectedNoteIndex(-1);
  }, [activeCategory, activeSubId, searchQuery]);

  useEffect(() => {
    if (!isActive || isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (activeNotes.length > 0) {
          setSelectedNoteIndex(prev => {
            const next = prev + 1;
            if (next >= activeNotes.length) {
              newNoteInputRef.current?.focus();
              return -1;
            } else {
              newNoteInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return next;
            }
          });
        }
        return;
      } else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (activeNotes.length > 0) {
          setSelectedNoteIndex(prev => {
            const next = prev - 1;
            if (next < -1) {
              newNoteInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return activeNotes.length - 1;
            } else if (next === -1) {
              newNoteInputRef.current?.focus();
              return -1;
            } else {
              newNoteInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return next;
            }
          });
        }
        return;
      }

      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable;
      
      if (isInputFocused) return;

      if (e.key === 'Enter') {
        if (e.ctrlKey) {
          if (editingNoteId) {
            e.preventDefault();
            handleSaveEdit(editingNoteId);
          }
        } else {
          if (selectedNoteIndex >= 0 && selectedNoteIndex < activeNotes.length) {
            e.preventDefault();
            if (editingNoteId) handleSaveEdit(editingNoteId);
            const note = activeNotes[selectedNoteIndex];
            setEditingNoteId(note.id);
            setEditingNoteTitle(note.title);
            setEditingNoteInfo(note.info || '');
          }
        }
      } else if (e.key.toLowerCase() === 's' && e.ctrlKey) {
        if (editingNoteId) {
          e.preventDefault();
          handleSaveEdit(editingNoteId, false);
        }
      } else if (e.key.toLowerCase() === 'c') {
        if (selectedNoteIndex >= 0 && selectedNoteIndex < activeNotes.length) {
          e.preventDefault();
          const note = activeNotes[selectedNoteIndex];
          if (note.info) {
            navigator.clipboard.writeText(note.info);
            setCopiedNoteId(note.id);
            setTimeout(() => setCopiedNoteId(null), 2000);
          }
        }
      } else if (e.key.toLowerCase() === 'd') {
        if (selectedNoteIndex >= 0 && selectedNoteIndex < activeNotes.length) {
          e.preventDefault();
          const note = activeNotes[selectedNoteIndex];
          setNoteToDelete(note.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isSidebarOpen, selectedNoteIndex, activeNotes]);

  useEffect(() => {
    if (selectedNoteIndex >= 0) {
      const el = document.getElementById(`note-item-${selectedNoteIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedNoteIndex]);

  const isHighlighted = (type: string, id: string | null) => {
    if (!isSidebarOpen || visibleItems.length === 0) return false;
    const current = visibleItems[selectedIndex];
    return current && current.type === type && current.id === id;
  };

  return (
    <div id="notes-tab-container" style={{ flex: 1, display: 'flex', height: '100%', backgroundColor: 'var(--bg-main)', minWidth: 0 }}>
      {/* Sidebar */}
      {/* Sidebar */}
      <DataSidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        activeCategory={activeCategory}
        activeSubId={activeSubId}
        selectCategory={selectCategory}
        toggleCategory={toggleCategory}
        isHighlighted={isHighlighted}
        getUnfinishedCount={getUnfinishedCount}
        expandedCategories={data.expanded_categories}
        generalLabel="General Notes"
        generalIcon={<IconSlash size={14} />}
        liveLabel="Live Notes"
        liveIcon={<IconRadio size={14} />}
        liveItems={Object.keys(data.live || {}).map(id => ({ id, name: id, priority: 'normal', count: 0 }))}
        templatesLabel="Template Notes"
        templatesIcon={<IconLayers size={14} />}
        templateItems={templateItems}
      />

      {/* Sidebar Toggle Area */}
      <div
        className="sidebar-toggle-zone"
        style={{ left: isSidebarOpen ? '170px' : '0px' }}
      >
        <div
          className="sidebar-toggle"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            position: 'absolute',
            left: isSidebarOpen ? '10px' : '0px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '12px',
            height: '48px',
            border: '1px solid var(--border-glass)',
            borderLeft: isSidebarOpen ? 'none' : '1px solid var(--border-glass)',
            borderRadius: isSidebarOpen ? '0 6px 6px 0' : '0 6px 6px 0',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div style={{ transform: isSidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>
            <IconChevronRight size={12} />
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', minWidth: 0 }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ 
            margin: 0, 
            color: 'var(--text-main)', 
            fontSize: '16px', 
            fontWeight: '800', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            userSelect: 'none'
          }}>
            <div 
              className="interactive-element" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ cursor: 'pointer', display: 'flex', padding: '4px', marginLeft: '-4px', borderRadius: '4px' }}
              title="Toggle Sidebar (Ctrl+L to open, Ctrl+H to close)"
            >
              {isSidebarOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
            </div>
            {activeCategory === 'general' && (
              <>
                <IconSlash size={18} color="var(--accent-blue)" /> General Notes
              </>
            )}
            {activeCategory === 'live' && (
              <>
                <IconRadio size={18} color="var(--accent-green)" /> {activeSubId || 'Live Notes'}
              </>
            )}
            {activeCategory === 'templates' && (
              <>
                <IconLayers size={18} color="var(--accent-yellow)" /> {activeSubId}
              </>
            )}
          </h2>
          <p style={{ margin: '4px 0 0 32px', color: 'var(--text-dim)', fontSize: '12px' }}>
            {activeCategory === 'templates' ? 'Manage the notes associated with this template.' : 'Manage your active notes and to-dos.'}
          </p>
        </div>

        {/* Note List */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          {activeNotes.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '13px' }}>
              No notes here yet. Press enter below to add one!
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="notes-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '10px', minWidth: 0 }}>
                    {activeNotes.map((note, index) => (
                      <Draggable key={note.id} draggableId={note.id} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            id={`note-item-${index}`}
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onMouseEnter={() => setHoveredNoteId(note.id)}
                            onMouseLeave={() => setHoveredNoteId(null)}
                            onBlur={(e) => {
                              if (!isActiveRef.current) return;
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                if (!document.hasFocus()) return;
                                setTimeout(() => {
                                  const container = document.getElementById('notes-tab-container');
                                  if (container && !container.contains(document.activeElement)) return;
                                  handleSaveEdit(note.id);
                                }, 0);
                              }
                            }}
                            className="interactive-element"
                            style={{
                              ...provided.draggableProps.style,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              padding: '8px 12px',
                              backgroundColor: snapshot.isDragging ? 'rgba(0, 43, 54, 0.8)' : 'rgba(0, 43, 54, 0.4)',
                              border: snapshot.isDragging || selectedNoteIndex === index ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                              boxShadow: selectedNoteIndex === index ? 'inset 0 0 0 1px var(--accent-blue)' : (snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : 'none'),
                              borderRadius: '8px',
                              transition: `${provided.draggableProps.style?.transition ? provided.draggableProps.style.transition + ', ' : ''}background-color 0.2s ease, border 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease`,
                              minWidth: 0
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                              <div 
                                {...provided.dragHandleProps}
                                style={{ color: 'var(--text-dim)', cursor: 'grab', opacity: hoveredNoteId === note.id || snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s', display: 'flex' }}
                              >
                                <IconGrip size={14} />
                              </div>
                              
                              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                                {editingNoteId === note.id ? (
                                  <input 
                                    value={editingNoteTitle}
                                    placeholder="Note Title"
                                    onChange={(e) => setEditingNoteTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') {
                                        setEditingNoteId(null);
                                      } else if (e.key === 'Enter' && e.ctrlKey) {
                                        handleSaveEdit(note.id);
                                      } else if (e.key.toLowerCase() === 's' && e.ctrlKey) {
                                        e.preventDefault();
                                        handleSaveEdit(note.id, false);
                                      }
                                    }}
                                    style={{
                                      width: '100%',
                                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                      border: '1px solid var(--border-glass)',
                                      borderRadius: '6px',
                                      padding: '8px 12px',
                                      color: 'var(--text-main)',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                      boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.2)'
                                    }}
                                  />
                                ) : (
                                  <div 
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteTitle(note.title);
                                      setEditingNoteInfo(note.info || '');
                                    }}
                                    style={{ 
                                      color: 'var(--text-main)', 
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {note.title}
                                  </div>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div style={{ display: 'flex', gap: '8px', opacity: (hoveredNoteId === note.id || selectedNoteIndex === index || copiedNoteId === note.id || editingNoteId === note.id) && !snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s' }}>
                                {editingNoteId === note.id && (editingNoteTitle !== note.title || editingNoteInfo !== (note.info || '')) && (
                                  <div 
                                    className="action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveEdit(note.id, false);
                                    }}
                                    style={{ color: 'var(--accent-green)', cursor: 'pointer', padding: '4px' }}
                                    title="Save Note"
                                  >
                                    <IconCheck size={14} />
                                  </div>
                                )}
                                {editingNoteId === note.id && (
                                  <div 
                                    className="action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveEdit(note.id);
                                    }}
                                    style={{ color: 'var(--text-main)', cursor: 'pointer', padding: '4px' }}
                                    title="Collapse Note"
                                  >
                                    <IconMinus size={14} />
                                  </div>
                                )}
                                <div 
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (note.info) {
                                      navigator.clipboard.writeText(note.info);
                                      setCopiedNoteId(note.id);
                                      setTimeout(() => setCopiedNoteId(null), 2000);
                                    }
                                  }}
                                  style={{ color: copiedNoteId === note.id ? 'var(--accent-green)' : 'var(--text-main)', cursor: 'pointer', padding: '4px' }}
                                  title="Copy Note Info"
                                >
                                  {copiedNoteId === note.id ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                </div>
                                <div 
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingNoteId(null);
                                    window.electronAPI.popoutNote(note.id);
                                  }}
                                  style={{ color: 'var(--text-main)', cursor: 'pointer', padding: '4px' }}
                                  title="Pop Out Note"
                                >
                                  <IconExternalLink size={14} />
                                </div>
                                <div 
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNoteToDelete(note.id);
                                  }}
                                  style={{ color: 'var(--accent-red)', cursor: 'pointer', padding: '4px' }}
                                  title="Delete"
                                >
                                  <IconTrash size={14} />
                                </div>
                              </div>
                            </div>

                            {editingNoteId === note.id && (
                              <TiptapEditor
                                value={editingNoteInfo}
                                onChange={(newInfo) => {
                                  setEditingNoteInfo(newInfo);
                                  handleSaveEdit(note.id, false, newInfo);
                                }}
                                onBlur={() => handleSaveEdit(note.id)}
                                autoFocus={true}
                              />
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>

        {/* Quick Add Input */}
        <div className="new-item-container" style={{ marginTop: '12px', position: 'relative' }}>
          <div className="new-item-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <IconPlus size={14} />
          </div>
          <input
            ref={newNoteInputRef}
            type="text"
            className="new-item-input"
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            onKeyDown={handleAddNote}
            placeholder={`Add a new note to ${activeCategory === 'general' ? 'General' : activeSubId}...`}
            style={{
              width: '100%',
              height: '36px',
              backgroundColor: 'rgba(0, 43, 54, 0.6)',
              borderRadius: '8px',
              padding: '0 12px 0 36px',
              color: 'var(--text-main)',
              fontSize: '13px',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {showCreateModal && (
        <CreateNoteModal
          existingLiveFolders={Object.keys(sessionData?.folders || {}).filter(k => k !== 'root').concat('root')}
          existingTemplates={templates.filter(t => !t.isDivider).map(t => t.name)}
          initialCategory={activeCategory}
          initialSubId={activeSubId}
          onSubmit={(title, info, category, subId) => {
            setShowCreateModal(false);
            const newNote: Note = {
              id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              title,
              info
            };
            const newData = { ...data };
            if (category === 'general') {
              newData.general = [...newData.general, newNote];
            } else if (category === 'live' && subId) {
              if (!newData.live[subId]) newData.live[subId] = [];
              newData.live[subId] = [...newData.live[subId], newNote];
            } else if (category === 'templates' && subId) {
              if (!newData.templates[subId]) newData.templates[subId] = [];
              newData.templates[subId] = [...newData.templates[subId], newNote];
            }
            writeData(newData);
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {noteToDelete && (
        <PromptModal
          title="Delete Note"
          description="Are you sure you want to delete this note?"
          defaultValue=""
          isConfirm={true}
          onSubmit={() => {
            handleDeleteNote(noteToDelete);
            setNoteToDelete(null);
            setSelectedNoteIndex(prev => Math.min(prev, activeNotes.length - 2));
          }}
          onCancel={() => setNoteToDelete(null)}
        />
      )}
    </div>
  );
}
