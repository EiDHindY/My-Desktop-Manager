import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { IconFolder, IconFolderOpen, IconPlus, IconCheck, IconSquare, IconChevronRight, IconChevronDown, IconTrash, IconGrip, IconPencil, IconInbox, IconRadio, IconLayers, IconCopy } from './Icons';
import CreateNoteModal from './CreateNoteModal';

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

export default function NotesTab({ notesData, sessionData, templates, searchQuery = '', onAction }: { notesData: any, sessionData: any, templates: any[], searchQuery?: string, onAction?: () => void }) {
  const [data, setData] = useState<NotesData>({
    general: [],
    live: {},
    templates: {},
    expanded_categories: ['general', 'live', 'templates']
  });

  const [activeCategory, setActiveCategory] = useState<'general' | 'live' | 'templates'>('general');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteInfo, setEditingNoteInfo] = useState('');
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCreateNew = () => setShowCreateModal(true);
    window.addEventListener('notes-create-new', handleCreateNew as EventListener);
    return () => window.removeEventListener('notes-create-new', handleCreateNew as EventListener);
  }, []);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
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
    // @ts-ignore
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

  const handleSaveEdit = (noteId: string) => {
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
      notesList[noteIndex] = { ...notesList[noteIndex], title: editingNoteTitle.trim(), info: editingNoteInfo };
      writeData(newData);
    }
    setEditingNoteId(null);
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
    
    if (searchQuery) {
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
    setShowDropdown(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', backgroundColor: 'var(--bg-main)', minWidth: 0 }}>
      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', minWidth: 0 }}>
        <div style={{ marginBottom: '16px', position: 'relative' }} ref={dropdownRef}>
          <h2 
            className="interactive-element"
            onClick={() => setShowDropdown(!showDropdown)}
            style={{ 
              margin: 0, 
              color: 'var(--text-main)', 
              fontSize: '16px', 
              fontWeight: '800', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '10px',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '8px',
              marginLeft: '-10px',
              transition: 'background-color 0.2s',
              userSelect: 'none'
            }}
          >
            {activeCategory === 'general' && (
              <>
                <IconInbox size={18} color="var(--accent-blue)" /> General Notes
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
            <div style={{ color: 'var(--text-dim)', display: 'flex', opacity: 0.7 }}>
              {showDropdown ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </div>
          </h2>
          
          {/* Dropdown Menu */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '280px',
              backgroundColor: 'rgba(7, 54, 66, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 100,
              maxHeight: 'calc(100vh - 180px)',
              overflowY: 'auto',
              padding: '12px'
            }}>
              {/* General Notes */}
              <div 
                className="interactive-element dropdown-item"
                onClick={() => selectCategory('general', null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeCategory === 'general' ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                  color: activeCategory === 'general' ? 'var(--accent-blue)' : 'var(--text-main)',
                  fontWeight: activeCategory === 'general' ? '700' : '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}
              >
                <IconInbox size={16} />
                <span style={{ flex: 1 }}>General Notes</span>
                {getUnfinishedCount('general') > 0 && (
                  <span style={{ backgroundColor: 'rgba(220, 50, 47, 0.2)', color: 'var(--accent-red)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>
                    {getUnfinishedCount('general')}
                  </span>
                )}
              </div>

              {/* Live Desktops */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '4px' }}>
                  <IconRadio size={12} color="var(--accent-green)" /> LIVE DESKTOPS
                </div>
                {sessionData?.folders && (() => {
                  const folders = sessionData.folders || {};
                  const savedOrder = sessionData.folder_order || [];
                  const allKeys = Object.keys(folders);
                  const folderNames = [
                    ...savedOrder.filter((k: string) => k !== 'root' && allKeys.includes(k)),
                    ...allKeys.filter((k: string) => !savedOrder.includes(k) && k !== 'root'),
                    'root'
                  ];
                  return folderNames.map((folderId: string) => {
                    const name = sessionData.folder_names?.[folderId] || folderId;
                    const isActive = activeCategory === 'live' && activeSubId === folderId;
                    return (
                      <div 
                        key={folderId}
                        className="interactive-element dropdown-item"
                        onClick={() => selectCategory('live', folderId)}
                        style={{
                          padding: '6px 12px',
                          margin: '2px 0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: isActive ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                          color: isActive ? 'var(--accent-blue)' : 'var(--text-main)',
                          fontSize: '13px',
                          fontWeight: isActive ? '700' : '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {isActive ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        {getUnfinishedCount('live', folderId) > 0 && (
                          <span style={{ backgroundColor: 'rgba(220, 50, 47, 0.2)', color: 'var(--accent-red)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>
                            {getUnfinishedCount('live', folderId)}
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Templates */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '4px' }}>
                  <IconLayers size={12} color="var(--accent-yellow)" /> TEMPLATES
                </div>
                {templates && templates.filter(t => !t.isDivider).map((template: any) => {
                  const isActive = activeCategory === 'templates' && activeSubId === template.name;
                  return (
                    <div 
                      key={template.name}
                      className="interactive-element dropdown-item"
                      onClick={() => selectCategory('templates', template.name)}
                      style={{
                        padding: '6px 12px',
                        margin: '2px 0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: isActive ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                        color: isActive ? 'var(--accent-blue)' : 'var(--text-main)',
                        fontSize: '13px',
                        fontWeight: isActive ? '700' : '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {isActive ? <IconLayers size={14} color="var(--accent-blue)" /> : <IconLayers size={14} />}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</span>
                      {getUnfinishedCount('templates', template.name) > 0 && (
                        <span style={{ backgroundColor: 'rgba(7, 54, 66, 0.8)', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>
                          {getUnfinishedCount('templates', template.name)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-dim)', fontSize: '12px' }}>
            {activeCategory === 'templates' ? 'Notes defined here will be copied to Live Desktops when this template is deployed.' : 'Manage your active notes and to-dos.'}
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
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onMouseEnter={() => setHoveredNoteId(note.id)}
                            onMouseLeave={() => setHoveredNoteId(null)}
                            className="interactive-element"
                            style={{
                              ...provided.draggableProps.style,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              backgroundColor: snapshot.isDragging ? 'rgba(0, 43, 54, 0.8)' : 'rgba(0, 43, 54, 0.4)',
                              border: snapshot.isDragging ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                              borderRadius: '8px',
                              transition: `${provided.draggableProps.style?.transition ? provided.draggableProps.style.transition + ', ' : ''}background-color 0.2s ease, border 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease`,
                              boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
                              minWidth: 0
                            }}
                          >
                            <div 
                              {...provided.dragHandleProps}
                              style={{ color: 'var(--text-dim)', cursor: 'grab', opacity: hoveredNoteId === note.id || snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s', display: 'flex' }}
                            >
                              <IconGrip size={14} />
                            </div>
                            
                            <div 
                              style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  handleSaveEdit(note.id);
                                }
                              }}
                            >
                              {editingNoteId === note.id ? (
                                <div 
                                  style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                                  onBlur={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                      handleSaveEdit(note.id);
                                    }
                                  }}
                                >
                                  <input 
                                    autoFocus
                                    value={editingNoteTitle}
                                    placeholder="Note Title"
                                    onChange={(e) => setEditingNoteTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditingNoteId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                      border: '1px solid var(--accent-blue)',
                                      borderRadius: '4px',
                                      padding: '6px 8px',
                                      color: 'var(--text-main)',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                  <textarea 
                                    value={editingNoteInfo}
                                    placeholder="Note Details"
                                    onChange={(e) => setEditingNoteInfo(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditingNoteId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      minHeight: '80px',
                                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                      border: '1px solid var(--accent-blue)',
                                      borderRadius: '4px',
                                      padding: '6px 8px',
                                      color: 'var(--text-dim)',
                                      fontSize: '13px',
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                      resize: 'vertical',
                                      fontFamily: 'inherit'
                                    }}
                                  />
                                </div>
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
                            <div style={{ display: 'flex', gap: '8px', opacity: hoveredNoteId === note.id && !snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s' }}>
                              <div 
                                className="action-btn"
                                onClick={() => {
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
                                onClick={() => handleDeleteNote(note.id)}
                                style={{ color: 'var(--accent-red)', cursor: 'pointer', padding: '4px' }}
                                title="Delete"
                              >
                                <IconTrash size={14} />
                              </div>
                            </div>
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
        <div style={{ marginTop: '12px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)', display: 'flex' }}>
            <IconPlus size={14} />
          </div>
          <input
            type="text"
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            onKeyDown={handleAddNote}
            placeholder={`Add a new note to ${activeCategory === 'general' ? 'General' : activeSubId}...`}
            style={{
              width: '100%',
              height: '36px',
              backgroundColor: 'rgba(0, 43, 54, 0.6)',
              border: '1px solid var(--accent-blue)',
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
    </div>
  );
}
