import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { IconFolder, IconFolderOpen, IconTrash, IconGrip, IconCopy, IconCheck } from './Icons';

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

export default function NotesTab({ notesData }: { notesData: NotesData | null }) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['root']);
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  // Optimistic local copy of notes data for instant drag-and-drop feedback
  const [localData, setLocalData] = useState<NotesData | null>(notesData);

  const notesDataRef = useRef(notesData);
  const expandedFoldersRef = useRef(expandedFolders);

  // Sync local data from props, but not while a drag is in progress
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

  // Drag and drop
  const onDragEnd = (result: any) => {
    isDragging.current = false;
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === 'FOLDER') {
      if (source.index === destination.index) return;
      // Reorder folders (root stays at index 0 but we keep it in folderOrder)
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

      // Auto-expand destination folder
      if (!expandedFolders.includes(dstFolder)) {
        setExpandedFolders(prev => [...prev, dstFolder]);
      }
    }
  };

  // Listen for custom events from App.tsx header buttons
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

  // Draggable folders exclude root from reordering (root is always first)
  const draggableFolders = folderOrder.filter(k => k !== 'root');

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <DragDropContext
        onDragStart={() => { isDragging.current = true; }}
        onDragEnd={onDragEnd}
      >
        {/* Draggable folders */}
        <Droppable droppableId="folders" type="FOLDER">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {draggableFolders.map((folderKey, index) => (
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
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* General (root) folder — always at bottom, not reorderable */}
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

// ─── FolderBlock sub-component ───────────────────────────────────────────────
function FolderBlock({
  folderKey, folderLabel, items = [], isExpanded, isRoot, dragHandle,
  hoveredFolder, hoveredItem, expandedNotes, localChecked,
  editingItemId, editingContent,
  onToggleFolder, onToggleCheck, onDeleteItem, onDeleteFolder, onToggleNote,
  onSaveText, onSaveContent,
  setHoveredFolder, setHoveredItem, setEditingItemId, setEditingContent,
}: any) {
  const pendingCount = (items as NoteItem[]).filter(i => (i.type || 'checkbox') === 'checkbox' && !((localChecked[i.id] ?? i.checked))).length;

  return (
    <div style={{ borderRadius: '10px', border: '1px solid #3b4261', overflow: 'hidden', backgroundColor: '#1e2030' }}>
      {/* Folder Header */}
      <div
        onClick={onToggleFolder}
        onMouseEnter={() => setHoveredFolder(folderKey)}
        onMouseLeave={() => setHoveredFolder(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', backgroundColor: '#24283b',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Drag handle for non-root folders */}
          {!isRoot && dragHandle && (
            <span {...dragHandle} onClick={(e) => e.stopPropagation()} style={{ color: '#3b4261', cursor: 'grab', display: 'flex', alignItems: 'center' }}>
              <IconGrip size={14} />
            </span>
          )}
          <span style={{ color: '#7aa2f7' }}>
            {isExpanded ? <IconFolderOpen size={20} /> : <IconFolder size={20} />}
          </span>
          <span style={{ fontWeight: 'bold', color: '#c8d3f5', fontSize: '14px' }}>{folderLabel}</span>
          {items.length > 0 && (
            <span style={{ backgroundColor: '#3b4261', color: '#7aa2f7', padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' }}>
              {pendingCount > 0 ? `${pendingCount} pending` : `${items.length} items`}
            </span>
          )}
        </div>
        {hoveredFolder === folderKey && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'checkbox', folderKey } })); }}
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#9ece6a', display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: '4px', fontSize: '12px' }}
              title="Add Checkbox"
            >
              ☑
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('notes-add', { detail: { type: 'note', folderKey } })); }}
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#bb9af7', display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: '4px', fontSize: '12px' }}
              title="Add Note"
            >
              📝
            </button>
            {!isRoot && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folderKey); }}
                style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#f7768e', display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: '4px' }}
                title="Delete Folder"
              >
                <IconTrash size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Items droppable area */}
      {isExpanded && (
        <Droppable droppableId={folderKey} type="ITEM">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px',
                minHeight: '36px',
                backgroundColor: snapshot.isDraggingOver ? 'rgba(122,162,247,0.05)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              {items.length === 0 && !snapshot.isDraggingOver && (
                <div style={{ color: '#565f89', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '12px' }}>
                  Empty — drag items here or use the buttons above.
                </div>
              )}
              {(items as NoteItem[]).map((item, idx) => (
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
                        folderKey={folderKey}
                        dragHandle={drag.dragHandleProps}
                        isNoteExpanded={expandedNotes.includes(item.id)}
                        isEditingText={editingItemId === item.id}
                        isEditingContent={editingContent[item.id] !== undefined}
                        editContentValue={editingContent[item.id]}
                        localChecked={localChecked}
                        hovered={hoveredItem === item.id}
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
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
}

// ─── NoteItemRow sub-component ───────────────────────────────────────────────
function NoteItemRow({
  item, dragHandle, isNoteExpanded, isEditingText,
  isEditingContent, editContentValue, localChecked, hovered,
  onToggleCheck, onDelete, onToggleNote,
  onStartEditText, onBlurText,
  onFocusContent, onChangeContent, onBlurContent,
}: any) {
  const [copied, setCopied] = useState(false);
  const itemType = item.type || 'checkbox';
  const isChecked = localChecked[item.id] ?? item.checked ?? false;

  return (
    <div style={{ borderRadius: '6px', overflow: 'hidden' }}>
      {/* Row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 10px',
        backgroundColor: hovered ? '#24283b' : 'transparent',
        borderRadius: '6px', transition: 'background 0.15s',
      }}>
        {/* Drag grip */}
        <span
          {...dragHandle}
          style={{ color: '#3b4261', cursor: 'grab', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <IconGrip size={13} />
        </span>

        {/* Checkbox or note icon */}
        {itemType === 'checkbox' ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={onToggleCheck}
            style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0, accentColor: '#7aa2f7' }}
          />
        ) : (
          <span onClick={onToggleNote} style={{ cursor: 'pointer', flexShrink: 0, fontSize: '14px', userSelect: 'none' }}>
            {isNoteExpanded ? '🗒️' : '📝'}
          </span>
        )}

        {/* Title */}
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
            style={{ flex: 1, background: '#1a1b26', border: '1px solid #7aa2f7', borderRadius: '4px', color: '#c8d3f5', padding: '2px 6px', fontSize: '13px', outline: 'none' }}
          />
        ) : (
          <span
            onDoubleClick={onStartEditText}
            onClick={itemType === 'note' ? onToggleNote : undefined}
            title={itemType === 'note' ? 'Click to expand · Double-click to rename' : 'Double-click to rename'}
            style={{
              flex: 1, fontSize: '13px',
              color: (itemType === 'checkbox' && isChecked) ? '#565f89' : '#c8d3f5',
              textDecoration: (itemType === 'checkbox' && isChecked) ? 'line-through' : 'none',
              cursor: itemType === 'note' ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {item.text}
          </span>
        )}

        {/* Actions (Copy & Delete) */}
        {hovered && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const textToCopy = itemType === 'note' && item.content ? item.content : item.text;
                navigator.clipboard.writeText(textToCopy)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(err => console.error('Copy failed:', err));
              }} 
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#9ece6a' : '#7aa2f7', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '4px', transition: 'color 0.2s ease' }} 
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }} 
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#f7768e', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '4px' }} 
              title="Delete"
            >
              <IconTrash size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded note textarea */}
      {itemType === 'note' && isNoteExpanded && (
        <div style={{ padding: '0 10px 10px 48px' }}>
          <textarea
            value={isEditingContent ? editContentValue : (item.content || '')}
            onFocus={onFocusContent}
            onChange={(e) => onChangeContent(e.target.value)}
            onBlur={onBlurContent}
            placeholder="Write your note here..."
            rows={5}
            style={{
              width: '100%', backgroundColor: '#1a1b26',
              border: '1px solid #3b4261', borderRadius: '6px',
              color: '#c8d3f5', fontSize: '13px', padding: '10px',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              lineHeight: '1.6', boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}
