import { useState, useEffect, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  IconFolder, IconFolderOpen, IconTrash, IconGrip, 
  IconCopy, IconCheck, IconFileText, IconSquare, IconLoader
} from './Icons';

interface NoteItem {
  id: string;
  type?: 'checkbox' | 'note';
  text: string;
  checked?: boolean;
  content?: string;
}

interface NotesData {
  folders: Record<string, NoteItem[]>;
  folder_order?: string[];
  folder_names?: Record<string, string>;
  expanded_folders?: string[];
}

interface FlatItem {
  type: 'folder' | 'item';
  id: string;
  folderKey: string;
  item?: NoteItem;
}

export default function NotesTab({ notesData, onAction }: { notesData: NotesData | null, onAction?: () => void }) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(notesData?.expanded_folders || ['root']);
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [localData, setLocalData] = useState<NotesData | null>(notesData);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingItemId, _setEditingItemId] = useState<string | null>(null);
  const editingItemIdRef = useRef<string | null>(null);
  const editingContentRef = useRef<{ [key: string]: string }>({});
  const selectedIndexRef = useRef(0);
  const flatDataRef = useRef<any[]>([]);

  const setEditingItemId = (id: string | null) => {
    editingItemIdRef.current = id;
    _setEditingItemId(id);
    if (id) {
      const idx = flatDataRef.current.findIndex((i: any) => i.id === id);
      if (idx !== -1) setSelectedIndex(idx);
    }
  };
  const [editingContent, _setEditingContent] = useState<Record<string, string>>({});
  const setEditingContent = (val: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    const next = typeof val === 'function' ? val(editingContentRef.current) : val;
    editingContentRef.current = next;
    _setEditingContent(next);
  };
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const notesDataRef = useRef(notesData);
  const expandedFoldersRef = useRef(expandedFolders);
  const isDragging = useRef(false);
  const justFinishedEditingRef = useRef(false); // blocks key-repeat Enter after input blur

  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);

  useEffect(() => {
    if (!isDragging.current) setLocalData(notesData);
    if (notesData?.expanded_folders) setExpandedFolders(notesData.expanded_folders);
  }, [notesData]);

  // Handle focus management separately from data updates
  useEffect(() => {
    // Focus on initial mount
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    // Return focus to container when editing finishes
    if (editingItemId === null && !isDragging.current) {
      containerRef.current?.focus();
    }
  }, [editingItemId]);
  useEffect(() => { notesDataRef.current = notesData; }, [notesData]);
  useEffect(() => { expandedFoldersRef.current = expandedFolders; }, [expandedFolders]);

  const writeNotes = async (newData: any) => {
    // @ts-ignore
    return await window.electronAPI.writeJSON('notes.json', newData);
  };

  const data = localData || notesData;
  const folders = data?.folders || { root: [] };
  const allKeys = Object.keys(folders);
  const savedOrder = data?.folder_order || [];
  const folderOrder = [
    ...savedOrder.filter((k: string) => k !== 'root' && allKeys.includes(k)),
    ...allKeys.filter(k => k !== 'root' && !savedOrder.includes(k)),
    'root'
  ].filter(k => allKeys.includes(k));

  const folderNames = data?.folder_names || {};
  const getFolderName = (key: string) => key === 'root' ? 'General' : (folderNames[key] || key);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    folderOrder.forEach(folderKey => {
      items.push({ type: 'folder', id: folderKey, folderKey });
      if (expandedFolders.includes(folderKey)) {
        const folderItems = folders[folderKey] || [];
        folderItems.forEach(item => {
          items.push({ type: 'item', id: item.id, folderKey, item });
        });
      }
    });
    return items;
  }, [folderOrder, expandedFolders, folders]);

  useEffect(() => {
    flatDataRef.current = flatItems;
  }, [flatItems]);

  const toggleFolder = (key: string) => {
    const next = expandedFolders.includes(key) 
      ? expandedFolders.filter(k => k !== key) 
      : [...expandedFolders, key];
    setExpandedFolders(next);
    writeNotes({ ...data, expanded_folders: next });
  };

  const toggleCheck = (folderKey: string, itemId: string) => {
    const currentChecked = localChecked[itemId] ?? (folders[folderKey] || []).find((i: NoteItem) => i.id === itemId)?.checked ?? false;
    const nextChecked = !currentChecked;
    setLocalChecked(prev => ({ ...prev, [itemId]: nextChecked }));
    const items = (folders[folderKey] || []).map((item: NoteItem) =>
      item.id === itemId ? { ...item, checked: nextChecked } : item
    );
    writeNotes({ ...data, folders: { ...folders, [folderKey]: items } });
  };

  const deleteItem = (folderKey: string, itemId: string) => {
    const items = (folders[folderKey] || []).filter((item: NoteItem) => item.id !== itemId);
    const newData = { ...data, folders: { ...folders, [folderKey]: items } };
    setLocalData(newData as NotesData);
    writeNotes(newData);
  };

  const deleteFolder = (folderKey: string) => {
    if (!window.confirm(`Delete folder "${getFolderName(folderKey)}" and all its items?`)) return;
    const newFolders = { ...folders };
    delete newFolders[folderKey];
    const newOrder = folderOrder.filter(k => k !== folderKey);
    const newNames = { ...(data?.folder_names || {}) };
    delete newNames[folderKey];
    const newData = { ...data, folders: newFolders, folder_order: newOrder, folder_names: newNames };
    setLocalData(newData as NotesData);
    writeNotes(newData);
  };

  const saveItemText = async (folderKey: string, itemId: string, text: string) => {
    const items = (folders[folderKey] || []).map((item: NoteItem) =>
      item.id === itemId ? { ...item, text } : item
    );
    const newData = { ...data, folders: { ...folders, [folderKey]: items } };
    
    // Optimistic Update
    setLocalData(newData as NotesData);
    
    setSavingIds(prev => new Set(prev).add(itemId));
    try {
      await writeNotes(newData);
      if (onAction) onAction();
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const saveItemContent = async (folderKey: string, itemId: string, content: string) => {
    const items = (folders[folderKey] || []).map((item: NoteItem) =>
      item.id === itemId ? { ...item, content } : item
    );
    const newData = { ...data, folders: { ...folders, [folderKey]: items } };
    
    // Optimistic Update
    setLocalData(newData as NotesData);

    setSavingIds(prev => new Set(prev).add(itemId));
    try {
      await writeNotes(newData);
      if (onAction) onAction();
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const toggleNoteExpand = (itemId: string) => {
    setExpandedNotes(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    // GUARDS: don't run navigation while focus is inside an input/textarea
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    if (justFinishedEditingRef.current) { 
      justFinishedEditingRef.current = false; 
      return; 
    }

    const currentFlatData = flatDataRef.current;
    const currentIdx = selectedIndexRef.current;
    if (currentFlatData.length === 0) return;

    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % currentFlatData.length);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + currentFlatData.length) % currentFlatData.length);
    } else if (e.ctrlKey && e.key === 'Enter') {
      console.warn('NAV: Ctrl+Enter caught by container');
      e.preventDefault();
      const item = currentFlatData[currentIdx];
      if (!item) return;
      if (item.type === 'folder') {
        toggleFolder(item.folderKey);
      } else if (item.type === 'item' && item.item) {
        if (item.item.type === 'note') {
          const noteId = item.item.id;
          if (!expandedNotes.includes(noteId)) {
            toggleNoteExpand(noteId);
          }
          // Focus the textarea after expansion
          setTimeout(() => {
            const el = document.getElementById(`note-content-${noteId}`);
            if (el) (el as HTMLTextAreaElement).focus();
          }, 100);
        } else {
          toggleCheck(item.folderKey, item.item.id);
        }
      }
    } else if (e.key === 'Enter') {
       console.log('NAV: Plain Enter ignored by container (Reserved for Rename)');
    } else if (e.key === 'Escape') {
      setSelectedIndex(-1);
    }
  };

  useEffect(() => {
    const focusedEl = document.getElementById(`flat-item-${selectedIndex}`);
    if (focusedEl && containerRef.current) {
      const container = containerRef.current;
      const rect = focusedEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
        focusedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const onDragEnd = (result: any) => {
    isDragging.current = false;
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === 'FOLDER') {
      if (source.index === destination.index) return;
      const reorderable = folderOrder.filter(k => k !== 'root');
      const [removed] = reorderable.splice(source.index, 1);
      reorderable.splice(destination.index, 0, removed);
      const newOrder = [...reorderable, 'root'];
      const newData = { ...data, folder_order: newOrder };
      setLocalData(newData as NotesData);
      writeNotes(newData);
    } else if (type === 'ITEM') {
      const srcFolder = source.droppableId;
      const dstFolder = destination.droppableId;
      if (srcFolder === dstFolder && source.index === destination.index) return;

      const newFolders = { ...folders };
      const srcItems = [...(newFolders[srcFolder] || [])];
      const [movedItem] = srcItems.splice(source.index, 1);
      newFolders[srcFolder] = srcItems;

      const dstItems = srcFolder === dstFolder ? srcItems : [...(newFolders[dstFolder] || [])];
      dstItems.splice(destination.index, 0, movedItem);
      newFolders[dstFolder] = dstItems;

      const newData = { ...data, folders: newFolders };
      setLocalData(newData as NotesData);
      writeNotes(newData);

      if (!expandedFolders.includes(dstFolder)) {
        const nextExpanded = [...expandedFolders, dstFolder];
        setExpandedFolders(nextExpanded);
        const finalData = { ...data, folders: newFolders, expanded_folders: nextExpanded };
        setLocalData(finalData as NotesData);
        writeNotes(finalData);
      } else {
        writeNotes(newData);
      }
    }
  };

  useEffect(() => {
    const handleAdd = (e: CustomEvent) => {
      const { type, folderKey = 'root' } = e.detail;
      const currentData = notesDataRef.current;
      const currentFolders = currentData?.folders || { root: [] };

      const newItem: NoteItem = {
        id: crypto.randomUUID(),
        type: type as 'checkbox' | 'note',
        text: type === 'checkbox' ? 'New Task' : 'Untitled Note',
        checked: false,
        content: '',
      };

      const currentItems = currentFolders[folderKey] || [];
      let nextExpanded = expandedFoldersRef.current;
      if (!nextExpanded.includes(folderKey)) {
        nextExpanded = [...nextExpanded, folderKey];
        setExpandedFolders(nextExpanded);
      }

      const newData = {
        ...currentData,
        folders: { ...currentFolders, [folderKey]: [newItem, ...currentItems] },
        expanded_folders: nextExpanded
      };
      setLocalData(newData as NotesData);
      writeNotes(newData);
      if (type === 'note') {
        setExpandedNotes(prev => [...prev, newItem.id]);
        setEditingContent(prev => ({ ...prev, [newItem.id]: '' }));
      }
      setEditingItemId(newItem.id);

      // Sync selection to the new item
      setTimeout(() => {
        const currentNotes = notesDataRef.current;
        const currentFolders = currentNotes?.folders || {};
        const currentOrder = currentNotes?.folder_order || Object.keys(currentFolders);
        const currentExpanded = expandedFoldersRef.current;

        const newFlatItems: any[] = [];
        currentOrder.forEach(fk => {
          newFlatItems.push({ type: 'folder', id: fk });
          if (currentExpanded.includes(fk)) {
            (currentFolders[fk] || []).forEach((item: any) => {
              newFlatItems.push({ type: 'item', id: item.id });
            });
          }
        });

        const idx = newFlatItems.findIndex(i => i.id === newItem.id);
        if (idx !== -1) setSelectedIndex(idx);
      }, 50); // Slight delay to let React process the addition
    };

    window.addEventListener('notes-add', handleAdd as EventListener);
    return () => window.removeEventListener('notes-add', handleAdd as EventListener);
  }, []);

  const draggableFolders = folderOrder.filter(k => k !== 'root');

  return (
    <div 
      className="flex flex-col h-full overflow-hidden" 
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={(e) => {
        // If clicking the background or non-interactive areas, regain focus
        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          containerRef.current?.focus();
        }
      }}
      style={{ outline: 'none' }} 
    >
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', height: '100%' }}>
        <DragDropContext
          onDragStart={() => { isDragging.current = true; }}
          onDragEnd={onDragEnd}
        >
          <Droppable droppableId="folders" type="FOLDER">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {draggableFolders.map((folderKey, index) => {
                const flatIndex = flatItems.findIndex(i => i.id === folderKey && i.type === 'folder');
                const isFocused = selectedIndex === flatIndex;
                return (
                  <Draggable key={folderKey} draggableId={`folder-${folderKey}`} index={index}>
                    {(drag, snapshot) => (
                      <div ref={drag.innerRef} {...drag.draggableProps} style={{ ...drag.draggableProps.style, opacity: snapshot.isDragging ? 0.85 : 1 }}>
                        <FolderBlock
                          folderKey={folderKey}
                          folderLabel={getFolderName(folderKey)}
                          items={folders[folderKey] as NoteItem[]}
                          isExpanded={expandedFolders.includes(folderKey)}
                          isRoot={false}
                          dragHandle={drag.dragHandleProps}
                          hoveredFolder={hoveredFolder}
                          hoveredItem={hoveredItem}
                          expandedNotes={expandedNotes}
                          localChecked={localChecked}
                          savingIds={savingIds}
                          editingItemId={editingItemId}
                          editingContent={editingContent}
                          isFocused={isFocused}
                          flatItems={flatItems}
                          selectedIndex={selectedIndex}
                          onToggleFolder={() => toggleFolder(folderKey)}
                          onToggleCheck={toggleCheck}
                          onDeleteItem={deleteItem}
                          onDeleteFolder={deleteFolder}
                          onToggleNote={toggleNoteExpand}
                          onSaveText={saveItemText}
                          onSaveContent={saveItemContent}
                          setHoveredFolder={setHoveredFolder}
                          setHoveredItem={setHoveredItem}
                          setEditingItemId={setEditingItemId}
                          setEditingContent={setEditingContent}
                          onMarkFinishedEditing={() => { justFinishedEditingRef.current = true; }}
                        />
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {folders['root'] !== undefined && (
          <FolderBlock
            folderKey="root"
            folderLabel="General"
            items={folders['root'] as NoteItem[]}
            isExpanded={expandedFolders.includes('root')}
            isRoot
            hoveredFolder={hoveredFolder}
            hoveredItem={hoveredItem}
            expandedNotes={expandedNotes}
            localChecked={localChecked}
            editingItemId={editingItemId}
            editingContent={editingContent}
            isFocused={selectedIndex === flatItems.findIndex(i => i.id === 'root' && i.type === 'folder')}
            flatItems={flatItems}
            selectedIndex={selectedIndex}
            onToggleFolder={() => toggleFolder('root')}
            onToggleCheck={toggleCheck}
            onDeleteItem={deleteItem}
            onDeleteFolder={deleteFolder}
            onToggleNote={toggleNoteExpand}
            onSaveText={saveItemText}
            onSaveContent={saveItemContent}
            setHoveredFolder={setHoveredFolder}
            setHoveredItem={setHoveredItem}
            setEditingItemId={setEditingItemId}
            setEditingContent={setEditingContent}
            savingIds={savingIds}
            onMarkFinishedEditing={() => { justFinishedEditingRef.current = true; }}
          />
        )}
      </DragDropContext>
      </div>
    </div>
  );
}

function FolderBlock({
  folderKey, folderLabel, items = [], isExpanded, isRoot, dragHandle,
  hoveredFolder, hoveredItem, expandedNotes, localChecked,
  editingItemId, editingContent, isFocused, flatItems, selectedIndex,
  onToggleFolder, onToggleCheck, onDeleteItem, onDeleteFolder, onToggleNote,
   onSaveText, onSaveContent,
   setHoveredFolder, setHoveredItem, setEditingItemId, setEditingContent,
    savingIds = new Set(), onMarkFinishedEditing,
 }: any) {
    const isAnyEditing = !!editingItemId || Object.keys(editingContent).length > 0;
    const pendingCount = items.filter((i: any) => {
      const isChecked = localChecked[i.id] ?? i.checked ?? false;
      return (i.type === 'checkbox' || !i.type) && !isChecked;
    }).length;
  
    return (
      <div 
        style={{ 
          borderRadius: '10px', 
          border: (isFocused && !isAnyEditing) ? '1px solid #7aa2f7' : (isExpanded ? '1px solid rgba(122, 162, 247, 0.3)' : '1px solid #3b4261'), 
          overflow: 'hidden', 
          backgroundColor: (isFocused && !isAnyEditing) ? 'rgba(122, 162, 247, 0.1)' : (isExpanded ? 'rgba(36, 40, 59, 0.3)' : 'transparent'),
          transition: 'all 0.2s ease'
        }}
      >
      <div
        onClick={(e) => {
          // If this was triggered by a keyboard "Enter" translation, block it if editing
          if (!e.clientX && !e.clientY && isAnyEditing) {
            console.log('BLOCKED: Keyboard-to-Click translation');
            return;
          }
          onToggleFolder();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            console.log('BLOCKED: Enter/Space on Folder Header');
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onMouseEnter={() => setHoveredFolder(folderKey)}
        onMouseLeave={() => setHoveredFolder(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', 
          backgroundColor: (isFocused && !isAnyEditing) ? 'rgba(122, 162, 247, 0.15)' : (hoveredFolder === folderKey ? '#292e42' : 'transparent'),
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.2s ease',
          borderLeft: (isFocused && !isAnyEditing) ? '3px solid #7aa2f7' : '3px solid transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isRoot && dragHandle && (
            <span {...dragHandle} onClick={(e) => e.stopPropagation()} style={{ color: '#3b4261', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
              <IconGrip size={14} />
            </span>
          )}
          <span style={{ color: '#7aa2f7' }}>
            {isExpanded ? <IconFolderOpen size={20} /> : <IconFolder size={20} />}
          </span>
          <span style={{ fontWeight: 'bold', color: isFocused ? '#7dcfff' : (isExpanded ? '#7dcfff' : '#c8d3f5'), fontSize: '14px' }}>{folderLabel}</span>
          {items.length > 0 && (
            <span style={{ 
              backgroundColor: pendingCount > 0 ? 'rgba(122, 162, 247, 0.1)' : '#3b4261', 
              color: pendingCount > 0 ? '#7aa2f7' : '#565f89', 
              padding: '1px 8px', 
              borderRadius: '10px', 
              fontSize: '11px', 
              fontWeight: '600' 
            }}>
              {pendingCount > 0 ? `${pendingCount} pending` : `${items.length} items`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', opacity: (hoveredFolder === folderKey || isFocused) ? 1 : 0.4, transition: 'opacity 0.2s' }}>
          <button
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey } })); }}
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#9ece6a', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
            title="Add Checkbox"
          >
            <IconSquare size={14} />
          </button>
          <button
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey } })); }}
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#bb9af7', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
            title="Add Note"
          >
            <IconFileText size={14} />
          </button>
          {!isRoot && (
            <button
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); onDeleteFolder(folderKey); }}
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#f7768e', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
              title="Delete Folder"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <Droppable droppableId={folderKey} type="ITEM">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px',
                minHeight: '36px',
                backgroundColor: snapshot.isDraggingOver ? 'rgba(122,162,247,0.05)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              {items.length === 0 && !snapshot.isDraggingOver && (
                <div style={{ color: '#565f89', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '16px' }}>
                  Empty — drag items here or use the buttons above.
                </div>
              )}
              {(items as NoteItem[]).map((item, idx) => {
                const itemFlatIndex = flatItems.findIndex((i: any) => i.id === item.id && i.type === 'item');
                const isItemFocused = selectedIndex === itemFlatIndex;
                return (
                  <Draggable key={item.id} draggableId={item.id} index={idx}>
                    {(drag, dSnap) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        style={{ ...drag.draggableProps.style, opacity: dSnap.isDragging ? 0.8 : 1 }}
                        onMouseEnter={() => setHoveredItem(item.id)}
                        onMouseLeave={() => setHoveredItem(null)}
                      >
                        <NoteItemRow
                          item={item}
                          id={`flat-item-${itemFlatIndex}`}
                          folderKey={folderKey}
                          dragHandle={drag.dragHandleProps}
                          isNoteExpanded={expandedNotes.includes(item.id)}
                          isEditingText={editingItemId === item.id}
                          isEditingContent={editingContent[item.id] !== undefined}
                          editContentValue={editingContent[item.id]}
                          localChecked={localChecked}
                          isSaving={savingIds?.has?.(item.id) || false}
                          hovered={hoveredItem === item.id || isItemFocused}
                          isFocused={isItemFocused}
                          onToggleCheck={() => onToggleCheck(folderKey, item.id)}
                          onDelete={() => onDeleteItem(folderKey, item.id)}
                          onToggleNote={() => onToggleNote(item.id)}
                          onStartEditText={() => setEditingItemId(item.id)}
                          onEnterConfirm={() => { if (onMarkFinishedEditing) onMarkFinishedEditing(); }}
                          onBlurText={(newText: string) => { 
                            if (newText.trim() && newText !== item.text) onSaveText(folderKey, item.id, newText); 
                            setEditingItemId(null); 
                          }}
                          onFocusContent={() => setEditingContent((p: any) => ({ ...p, [item.id]: item.content || '' }))}
                          onChangeContent={(v: string) => setEditingContent((p: any) => ({ ...p, [item.id]: v }))}
                          onBlurContent={() => { onSaveContent(folderKey, item.id, editingContent[item.id]); setEditingContent((p: any) => { const n = { ...p }; delete n[item.id]; return n; }); }}
                        />
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
}

function NoteItemRow({
  item, id, dragHandle, isNoteExpanded, isEditingText,
  isEditingContent, editContentValue, localChecked, hovered, isFocused,
  onToggleCheck, onDelete, onToggleNote,
   onStartEditText, onBlurText, onEnterConfirm,
   onFocusContent, onChangeContent, onBlurContent,
   isSaving,
 }: any) {
  const [copied, setCopied] = useState(false);
  const itemType = item.type || 'checkbox';
  const isChecked = localChecked[item.id] ?? item.checked ?? false;

    const isAnyEditing = !!isEditingText || !!isEditingContent;
  
    return (
      <div id={id} style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '2px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 12px',
          backgroundColor: hovered ? '#292e42' : 'transparent',
          borderRadius: '6px', transition: 'background 0.15s ease',
          borderLeft: (isFocused && !isAnyEditing) ? '3px solid #7dcfff' : '3px solid transparent'
        }}>
        <span
          {...dragHandle}
          style={{ color: '#3b4261', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: hovered ? 1 : 0 }}
        >
          <IconGrip size={13} />
        </span>

         {isSaving ? (
           <span style={{ color: '#7aa2f7', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
             <IconLoader size={16} />
           </span>
         ) : itemType === 'checkbox' ? (
           <div 
             className="btn-hover"
             onClick={onToggleCheck}
             style={{ 
               width: '18px', 
               height: '18px', 
               borderRadius: '4px', 
               border: isChecked ? '1px solid #7aa2f7' : '1px solid #3b4261',
               backgroundColor: isChecked ? '#7aa2f7' : 'transparent',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               cursor: 'pointer',
               flexShrink: 0,
               transition: 'all 0.2s ease',
               boxShadow: isChecked ? '0 0 8px rgba(122, 162, 247, 0.4)' : 'none'
             }}
           >
             {isChecked && <IconCheck size={12} color="#1a1b26" />}
           </div>
         ) : (
           <span 
             className="btn-hover"
             onClick={onToggleNote} 
             style={{ 
               color: isNoteExpanded ? '#7dcfff' : '#bb9af7', 
               cursor: 'pointer', 
               flexShrink: 0, 
               display: 'flex', 
               alignItems: 'center',
               transition: 'all 0.2s ease'
             }}
           >
             <IconFileText size={16} />
           </span>
         )}

        {isEditingText ? (
          <input
            id={`item-text-${item.id}`}
            type="text"
            defaultValue={item.text}
            autoFocus
            onFocus={(e) => e.target.select()}
            onBlur={(e) => onBlurText(e.target.value)}
             onKeyDown={(e) => {
               e.nativeEvent.stopImmediatePropagation();
               e.stopPropagation();
               if (e.key === 'Enter') {
                 e.preventDefault();
                 onEnterConfirm?.(); // set the flag BEFORE blur so container ignores next Enter
                 e.currentTarget.blur();
               } else if (e.key === 'Escape') {
                 e.preventDefault();
                 e.currentTarget.value = item.text;
                 e.currentTarget.blur();
               }
             }}
            style={{ flex: 1, background: '#1a1b26', border: '1px solid #7aa2f7', borderRadius: '4px', color: '#c8d3f5', padding: '4px 8px', fontSize: '13px', outline: 'none' }}
          />
        ) : (
          <span
            onDoubleClick={onStartEditText}
            onClick={itemType === 'note' ? onToggleNote : undefined}
            style={{
              flex: 1, fontSize: '13px',
              color: (itemType === 'checkbox' && isChecked) ? '#565f89' : '#c8d3f5',
              textDecoration: (itemType === 'checkbox' && isChecked) ? 'line-through' : 'none',
              cursor: itemType === 'note' ? 'pointer' : 'default',
              userSelect: 'none',
              fontWeight: (isFocused || (itemType === 'note' && isNoteExpanded)) ? '600' : '400',
              transition: 'all 0.2s ease'
            }}
          >
            {item.text}
          </span>
        )}

        <div style={{ display: 'flex', gap: '6px', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
          <button 
            className="btn-hover"
            onClick={(e) => {
              e.stopPropagation();
              const textToCopy = itemType === 'note' && item.content ? item.content : item.text;
              navigator.clipboard.writeText(textToCopy).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }} 
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#9ece6a' : '#7aa2f7', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }} 
            title="Copy"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </button>
          <button 
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#f7768e', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }} 
            title="Delete"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {itemType === 'note' && isNoteExpanded && (
        <div style={{ padding: '4px 12px 12px 40px' }}>
          <textarea
            id={`note-content-${item.id}`}
            value={isEditingContent ? editContentValue : (item.content || '')}
            onFocus={onFocusContent}
            onChange={(e) => onChangeContent(e.target.value)}
            onBlur={onBlurContent}
            placeholder="Write your note here..."
            rows={5}
            onKeyDown={(e) => {
              // Kill the event at the native level — no window listener will ever see this
              e.nativeEvent.stopImmediatePropagation();
              e.stopPropagation();
              // Escape cancels editing without saving
              if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            style={{
              width: '100%', backgroundColor: 'rgba(26, 27, 38, 0.5)',
              border: '1px solid #3b4261', borderRadius: '8px',
              color: '#c8d3f5', fontSize: '13px', padding: '12px',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              lineHeight: '1.6', boxSizing: 'border-box',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          />
        </div>
      )}
    </div>
  );
}
