import { useState, useEffect, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  IconFolder, IconFolderOpen, IconTrash, IconGrip, 
  IconCopy, IconCheck, IconFileText, IconSquare
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
}

interface FlatItem {
  type: 'folder' | 'item';
  id: string;
  folderKey: string;
  item?: NoteItem;
}

export default function NotesTab({ notesData }: { notesData: NotesData | null }) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['root']);
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  const [localData, setLocalData] = useState<NotesData | null>(notesData);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const notesDataRef = useRef(notesData);
  const expandedFoldersRef = useRef(expandedFolders);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) setLocalData(notesData);
  }, [notesData]);
  useEffect(() => { notesDataRef.current = notesData; }, [notesData]);
  useEffect(() => { expandedFoldersRef.current = expandedFolders; }, [expandedFolders]);

  const writeNotes = (newData: any) => {
    // @ts-ignore
    window.electronAPI.writeJSON('notes.json', newData);
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

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
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

  const saveItemText = (folderKey: string, itemId: string, text: string) => {
    const items = (folders[folderKey] || []).map((item: NoteItem) =>
      item.id === itemId ? { ...item, text } : item
    );
    writeNotes({ ...data, folders: { ...folders, [folderKey]: items } });
  };

  const saveItemContent = (folderKey: string, itemId: string, content: string) => {
    const items = (folders[folderKey] || []).map((item: NoteItem) =>
      item.id === itemId ? { ...item, content } : item
    );
    writeNotes({ ...data, folders: { ...folders, [folderKey]: items } });
  };

  const toggleNoteExpand = (itemId: string) => {
    setExpandedNotes(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (flatItems.length === 0 || editingItemId || Object.keys(editingContent).length > 0) return;

      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item.type === 'folder') {
          toggleFolder(item.folderKey);
        } else if (item.type === 'item' && item.item) {
          if (item.item.type === 'note') {
            toggleNoteExpand(item.item.id);
          } else {
            toggleCheck(item.folderKey, item.item.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatItems, selectedIndex, editingItemId, editingContent]);

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
        setExpandedFolders(prev => [...prev, dstFolder]);
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
      const newData = {
        ...currentData,
        folders: { ...currentFolders, [folderKey]: [newItem, ...currentItems] },
      };
      setLocalData(newData as NotesData);
      writeNotes(newData);

      if (!expandedFoldersRef.current.includes(folderKey)) {
        setExpandedFolders(prev => [...prev, folderKey]);
      }
      if (type === 'note') {
        setExpandedNotes(prev => [...prev, newItem.id]);
        setEditingContent(prev => ({ ...prev, [newItem.id]: '' }));
      }
      setEditingItemId(newItem.id);
    };

    window.addEventListener('notes-add', handleAdd as EventListener);
    return () => window.removeEventListener('notes-add', handleAdd as EventListener);
  }, []);

  const draggableFolders = folderOrder.filter(k => k !== 'root');

  return (
    <div ref={containerRef} style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', height: '100%' }}>
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
          />
        )}
      </DragDropContext>
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
}: any) {
  const pendingCount = (items as NoteItem[]).filter(i => (i.type || 'checkbox') === 'checkbox' && !((localChecked[i.id] ?? i.checked))).length;
  const folderFlatIndex = flatItems.findIndex((i: any) => i.id === folderKey && i.type === 'folder');

  return (
    <div 
      id={`flat-item-${folderFlatIndex}`}
      style={{ 
        borderRadius: '10px', 
        border: isFocused ? '1px solid #7aa2f7' : (isExpanded ? '1px solid rgba(122, 162, 247, 0.3)' : '1px solid #3b4261'), 
        overflow: 'hidden', 
        backgroundColor: isFocused ? 'rgba(122, 162, 247, 0.1)' : (isExpanded ? 'rgba(36, 40, 59, 0.3)' : 'transparent'),
        transition: 'all 0.2s ease'
      }}
    >
      <div
        onClick={onToggleFolder}
        onMouseEnter={() => setHoveredFolder(folderKey)}
        onMouseLeave={() => setHoveredFolder(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', 
          backgroundColor: isFocused ? 'rgba(122, 162, 247, 0.15)' : (hoveredFolder === folderKey ? '#292e42' : 'transparent'),
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.2s ease',
          borderLeft: isFocused ? '3px solid #7aa2f7' : '3px solid transparent'
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
                          hovered={hoveredItem === item.id || isItemFocused}
                          isFocused={isItemFocused}
                          onToggleCheck={() => onToggleCheck(folderKey, item.id)}
                          onDelete={() => onDeleteItem(folderKey, item.id)}
                          onToggleNote={() => onToggleNote(item.id)}
                          onStartEditText={() => setEditingItemId(item.id)}
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
  onStartEditText, onBlurText,
  onFocusContent, onChangeContent, onBlurContent,
}: any) {
  const [copied, setCopied] = useState(false);
  const itemType = item.type || 'checkbox';
  const isChecked = localChecked[item.id] ?? item.checked ?? false;

  return (
    <div id={id} style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '2px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 12px',
        backgroundColor: hovered ? '#292e42' : 'transparent',
        borderRadius: '6px', transition: 'background 0.15s ease',
        borderLeft: isFocused ? '3px solid #7dcfff' : '3px solid transparent'
      }}>
        <span
          {...dragHandle}
          style={{ color: '#3b4261', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: hovered ? 1 : 0 }}
        >
          <IconGrip size={13} />
        </span>

        {itemType === 'checkbox' ? (
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
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
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
            value={isEditingContent ? editContentValue : (item.content || '')}
            onFocus={onFocusContent}
            onChange={(e) => onChangeContent(e.target.value)}
            onBlur={onBlurContent}
            placeholder="Write your note here..."
            rows={5}
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
