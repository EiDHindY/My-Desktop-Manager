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

export default function NotesTab({ notesData, searchQuery = '', onAction }: { notesData: NotesData | null, searchQuery?: string, onAction?: () => void }) {
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

  const query = searchQuery.toLowerCase();

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    folderOrder.forEach(folderKey => {
      const folderName = getFolderName(folderKey).toLowerCase();
      const folderItems = folders[folderKey] || [];
      const matchingItems = folderItems.filter(item => 
        item.text.toLowerCase().includes(query) || 
        (item.content || '').toLowerCase().includes(query)
      );
      const folderMatches = folderName.includes(query);

      if (query && !folderMatches && matchingItems.length === 0) return;

      items.push({ type: 'folder', id: folderKey, folderKey });
      if (query || expandedFolders.includes(folderKey)) {
        const itemsToDisplay = query ? matchingItems : folderItems;
        itemsToDisplay.forEach(item => {
          items.push({ type: 'item', id: item.id, folderKey, item });
        });
      }
    });
    return items;
  }, [folderOrder, expandedFolders, folders, query]);

  // Auto-select first item when searching
  useEffect(() => {
    if (searchQuery) {
      setSelectedIndex(0);
    }
  }, [searchQuery]);

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
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={(e) => {
        // If clicking the background or non-interactive areas, regain focus
        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          containerRef.current?.focus();
        }
      }}
      className="custom-scrollbar"
      style={{ outline: 'none', height: '100%', overflowY: 'auto', padding: '16px', scrollBehavior: 'smooth' }} 
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <DragDropContext
          onDragStart={() => { isDragging.current = true; }}
          onDragEnd={onDragEnd}
        >
          <Droppable droppableId="folders" type="FOLDER" isDropDisabled={!!query}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {draggableFolders.map((folderKey, index) => {
                const flatIndex = flatItems.findIndex(i => i.id === folderKey && i.type === 'folder');
                const isFocused = selectedIndex === flatIndex;
                return (
                  <Draggable key={folderKey} draggableId={`folder-${folderKey}`} index={index} isDragDisabled={!!query}>
                    {(drag, snapshot) => (
                      <div ref={drag.innerRef} {...drag.draggableProps} style={{ ...drag.draggableProps.style, opacity: snapshot.isDragging ? 0.85 : 1 }}>
                        <FolderBlock
                          folderKey={folderKey}
                          folderLabel={getFolderName(folderKey)}
                          items={(folders[folderKey] || []).filter(item => !query || item.text.toLowerCase().includes(query) || (item.content || '').toLowerCase().includes(query))}
                          isExpanded={query || expandedFolders.includes(folderKey)}
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
                          isSearchActive={!!query}
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
            items={(folders['root'] || []).filter(item => !query || item.text.toLowerCase().includes(query) || (item.content || '').toLowerCase().includes(query))}
            isExpanded={query || expandedFolders.includes('root')}
            isRoot
            hoveredFolder={hoveredFolder}
            hoveredItem={hoveredItem}
            expandedNotes={expandedNotes}
            localChecked={localChecked}
            editingItemId={editingItemId}
            editingContent={editingContent}
            isFocused={selectedIndex === flatItems.findIndex(i => i.id === 'root' && i.type === 'folder')}
            isSearchActive={!!query}
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
    savingIds = new Set(), onMarkFinishedEditing, isSearchActive,
 }: any) {
    const isAnyEditing = !!editingItemId || Object.keys(editingContent).length > 0;
    const pendingCount = items.filter((i: any) => {
      const isChecked = localChecked[i.id] ?? i.checked ?? false;
      return (i.type === 'checkbox' || !i.type) && !isChecked;
    }).length;
  
    return (
      <div 
        className={`unified-glass-card ${isFocused && !isAnyEditing ? 'lifted-card' : ''}`}
        style={{ 
          border: (isFocused && !isAnyEditing) ? '1px solid var(--accent-blue)' : (isExpanded ? '1px solid var(--border-glass)' : '1px solid var(--border-glass)'), 
          overflow: 'hidden', 
          backgroundColor: (isFocused && !isAnyEditing) ? 'rgba(122, 162, 247, 0.08)' : (isExpanded ? 'rgba(30, 32, 48, 0.45)' : 'rgba(30, 32, 48, 0.3)'),
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: (isFocused && !isAnyEditing) ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(122, 162, 247, 0.1)' : 'none'
        }}
      >
      <div
        onClick={(e) => {
          // If this was triggered by a keyboard "Enter" translation, block it if editing
          if (!e.clientX && !e.clientY && isAnyEditing) {
            return;
          }
          onToggleFolder();
        }}
        onMouseEnter={() => setHoveredFolder(folderKey)}
        onMouseLeave={() => setHoveredFolder(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', 
          backgroundColor: (isFocused && !isAnyEditing) ? 'rgba(122, 162, 247, 0.05)' : 'transparent',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.2s ease',
          borderLeft: (isFocused && !isAnyEditing) ? '4px solid var(--accent-blue)' : '4px solid transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isRoot && dragHandle && (
            <span {...dragHandle} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text-dim)', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
              <IconGrip size={14} />
            </span>
          )}
          <div style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: '6px', 
            background: isExpanded ? 'rgba(122, 162, 247, 0.15)' : 'rgba(30, 32, 48, 0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--accent-blue)',
            transition: 'all 0.3s'
          }}>
            {isExpanded ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
          </div>
          <span style={{ fontWeight: '700', color: isFocused ? 'var(--accent-cyan)' : 'var(--text-main)', fontSize: '14px' }}>{folderLabel}</span>
          {items.length > 0 && (
            <span style={{ 
              backgroundColor: pendingCount > 0 ? 'rgba(122, 162, 247, 0.1)' : 'rgba(255, 255, 255, 0.05)', 
              color: pendingCount > 0 ? 'var(--accent-blue)' : 'var(--text-dim)', 
              padding: '2px 8px', 
              borderRadius: '10px', 
              fontSize: '10px', 
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              border: '1px solid rgba(122, 162, 247, 0.1)'
            }}>
              {pendingCount > 0 ? `${pendingCount} pending` : `${items.length} items`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', opacity: (hoveredFolder === folderKey || isFocused) ? 1 : 0.4, transition: 'opacity 0.2s' }}>
          <button
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey } })); }}
            style={{ backgroundColor: 'rgba(158, 206, 106, 0.1)', border: '1px solid rgba(158, 206, 106, 0.2)', cursor: 'pointer', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', justifyContent: 'center' }}
            title="Add Checkbox"
          >
            <IconSquare size={14} />
          </button>
          <button
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey } })); }}
            style={{ backgroundColor: 'rgba(187, 154, 247, 0.1)', border: '1px solid rgba(187, 154, 247, 0.2)', cursor: 'pointer', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', justifyContent: 'center' }}
            title="Add Note"
          >
            <IconFileText size={14} />
          </button>
          {!isRoot && (
            <button
              className="btn-hover"
              onClick={(e) => { e.stopPropagation(); onDeleteFolder(folderKey); }}
              style={{ backgroundColor: 'rgba(247, 118, 142, 0.1)', border: '1px solid rgba(247, 118, 142, 0.2)', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', justifyContent: 'center' }}
              title="Delete Folder"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <Droppable droppableId={folderKey} type="ITEM" isDropDisabled={isSearchActive}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px',
                minHeight: '36px',
                backgroundColor: snapshot.isDraggingOver ? 'rgba(122,162,247,0.05)' : 'rgba(0, 0, 0, 0.15)',
                transition: 'background 0.15s',
                borderTop: '1px solid var(--border-glass)'
              }}
            >
              {items.length === 0 && !snapshot.isDraggingOver && (
                <div style={{ color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                  Empty — drag items here or use the buttons above.
                </div>
              )}
              {(items as NoteItem[]).map((item, idx) => {
                const itemFlatIndex = flatItems.findIndex((i: any) => i.id === item.id && i.type === 'item');
                const isItemFocused = selectedIndex === itemFlatIndex;
                return (
                  <Draggable key={item.id} draggableId={item.id} index={idx} isDragDisabled={isSearchActive}>
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
      <div id={id} style={{ borderRadius: '8px', overflow: 'hidden', marginBottom: '2px' }}>
        <div 
          className="interactive-element"
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 14px',
            backgroundColor: hovered ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
            borderRadius: '8px', transition: 'background 0.15s ease',
            borderLeft: (isFocused && !isAnyEditing) ? '3px solid var(--accent-cyan)' : '3px solid transparent'
          }}
        >
        <span
          {...dragHandle}
          style={{ color: 'var(--text-dim)', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: hovered ? 1 : 0 }}
        >
          <IconGrip size={13} />
        </span>

         {isSaving ? (
           <span style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
             <IconLoader size={16} />
           </span>
         ) : itemType === 'checkbox' ? (
           <div 
             className="btn-hover"
             onClick={onToggleCheck}
             style={{ 
               width: '20px', 
               height: '20px', 
               borderRadius: '6px', 
               border: isChecked ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
               backgroundColor: isChecked ? 'var(--accent-blue)' : 'rgba(30, 32, 48, 0.6)',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               cursor: 'pointer',
               flexShrink: 0,
               transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
               boxShadow: isChecked ? 'var(--aurora-glow)' : 'none'
             }}
           >
             {isChecked && <IconCheck size={12} color="#1a1b26" />}
           </div>
         ) : (
           <span 
             className="btn-hover"
             onClick={onToggleNote} 
             style={{ 
               color: isNoteExpanded ? 'var(--accent-cyan)' : 'var(--accent-purple)', 
               cursor: 'pointer', 
               flexShrink: 0, 
               display: 'flex', 
               alignItems: 'center',
               transition: 'all 0.2s ease',
               background: isNoteExpanded ? 'rgba(125, 207, 255, 0.1)' : 'rgba(187, 154, 247, 0.1)',
               padding: '6px',
               borderRadius: '6px',
               border: isNoteExpanded ? '1px solid rgba(125, 207, 255, 0.2)' : '1px solid rgba(187, 154, 247, 0.2)'
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
                 onEnterConfirm?.(); 
                 e.currentTarget.blur();
               } else if (e.key === 'Escape') {
                 e.preventDefault();
                 e.currentTarget.value = item.text;
                 e.currentTarget.blur();
               }
             }}
            style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--accent-blue)', borderRadius: '6px', color: 'var(--text-main)', padding: '6px 12px', fontSize: '13px', outline: 'none', boxShadow: '0 0 10px rgba(122, 162, 247, 0.2)' }}
          />
        ) : (
          <span
            onDoubleClick={onStartEditText}
            onClick={itemType === 'note' ? onToggleNote : undefined}
            style={{
              flex: 1, fontSize: '13px',
              color: (itemType === 'checkbox' && isChecked) ? 'var(--text-dim)' : 'var(--text-main)',
              textDecoration: (itemType === 'checkbox' && isChecked) ? 'line-through' : 'none',
              cursor: itemType === 'note' ? 'pointer' : 'default',
              userSelect: 'none',
              fontWeight: (isFocused || (itemType === 'note' && isNoteExpanded)) ? '700' : '500',
              transition: 'all 0.2s ease',
              opacity: (itemType === 'checkbox' && isChecked) ? 0.6 : 1
            }}
          >
            {item.text}
          </span>
        )}

        <div style={{ display: 'flex', gap: '8px', opacity: hovered ? 1 : 0, transition: 'opacity 0.2s' }}>
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
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: copied ? 'var(--accent-green)' : 'var(--text-dim)', border: '1px solid rgba(255, 255, 255, 0.1)', width: '28px', height: '28px', padding: 0, borderRadius: '6px', justifyContent: 'center', display: 'flex', alignItems: 'center' }}
            title="Copy Content"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </button>
          <button 
            className="btn-hover"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ backgroundColor: 'rgba(247, 118, 142, 0.05)', color: 'var(--accent-red)', border: '1px solid rgba(247, 118, 142, 0.1)', width: '28px', height: '28px', padding: 0, borderRadius: '6px', justifyContent: 'center', display: 'flex', alignItems: 'center' }}
            title="Delete Item"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {itemType === 'note' && isNoteExpanded && (
        <div style={{ padding: '4px 10px 12px 42px', animation: 'fadeIn 0.2s ease' }}>
          <textarea
            id={`note-content-${item.id}`}
            value={editContentValue ?? item.content ?? ''}
            onChange={(e) => onChangeContent(e.target.value)}
            onFocus={onFocusContent}
            onBlur={onBlurContent}
            placeholder="Add some details..."
            style={{
              width: '100%',
              minHeight: '120px',
              background: 'rgba(26, 27, 38, 0.6)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: 'var(--text-main)',
              padding: '12px',
              fontSize: '13px',
              resize: 'vertical',
              outline: 'none',
              transition: 'all 0.3s ease',
              lineHeight: '1.6',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(122, 162, 247, 0.4)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-glass)'}
          />
        </div>
      )}
    </div>
  );
}
