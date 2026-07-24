import { useState, useEffect, useRef, useMemo } from 'react';
import { IconTerminal, IconPlay, IconFolder, IconFolderOpen, IconPencil, IconLoader, IconFilePlus, IconTrash, ManualIcon, IconRocket, IconKeyboard, IconGrip, IconFileText, IconImport, IconType, IconMonitor } from './Icons';
import IconPicker from './IconPicker';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import CreateTemplateScriptModal from './CreateTemplateScriptModal';

interface Task {
  id: string;
  name: string;
  script: string;
  icon?: string;
  icons?: string[];
  shortcut?: string;
  isExecutable?: boolean;
}

interface Template {
  name: string;
  filename: string;
  isDivider?: boolean;
  tasks?: Task[];
}

interface FlatItem {
  type: 'template' | 'task';
  id: string;
  name: string;
  filename?: string;
  templateName?: string;
  taskId?: string;
}

export default function TempsTab({ templates, searchQuery, onAction, setPromptConfig }: { templates: Template[], searchQuery?: string, onAction?: () => void, setPromptConfig?: any }) {
  const [localTemplates, setLocalTemplates] = useState<Template[]>(templates);
  const [expandedTemps, setExpandedTemps] = useState<string[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<Record<string, boolean>>({});
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [showIconPicker, setShowIconPicker] = useState<{ filename: string, taskId: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCreateNew = () => setShowCreateModal(true);
    window.addEventListener('temps-create-new', handleCreateNew);
    return () => window.removeEventListener('temps-create-new', handleCreateNew);
  }, []);

  useEffect(() => {
    setLocalTemplates(templates);
  }, [templates]);

  const query = (searchQuery || '').toLowerCase().trim();

  const filteredTemplates = useMemo(() => {
    return localTemplates.map(temp => {
      if (!query) return temp;

      const fuzzyMatch = (str: string, q: string) => {
        let i = 0;
        for (let j = 0; j < str.length && i < q.length; j++) {
          if (str[j] === q[i]) i++;
        }
        return i === q.length;
      };

      const nameMatch = fuzzyMatch(temp.name.toLowerCase(), query);
      const matchingTasks = temp.tasks?.filter(t => fuzzyMatch(t.name.toLowerCase(), query)) || [];
      if (nameMatch || matchingTasks.length > 0) {
        return { ...temp, tasks: nameMatch ? temp.tasks : matchingTasks };
      }
      return null;
    }).filter(Boolean) as Template[];
  }, [localTemplates, query]);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    filteredTemplates.forEach(temp => {
      if (!temp.isDivider) {
        items.push({ type: 'template', id: temp.filename, name: temp.name, filename: temp.filename });
      }
      const isExpanded = query ? true : expandedTemps.includes(temp.filename);
      if (isExpanded && temp.tasks) {
        temp.tasks.forEach(task => {
          items.push({ 
            type: 'task', 
            id: `${temp.filename}-${task.id}`, 
            name: task.name, 
            templateName: temp.name, 
            taskId: task.id,
            filename: temp.filename
          });
        });
      }
    });
    return items;
  }, [filteredTemplates, expandedTemps, query]);

  const toggleExpand = (filename: string) => {
    setExpandedTemps(prev => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]);
  };

  const handleDeployTemplate = async (templateFilename: string, templateName: string) => {
    const key = `deploy-temp-${templateFilename}`;
    setLoadingTasks(prev => ({ ...prev, [key]: true }));
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "DEPLOY_ALL:${templateName}"`);
    setLoadingTasks(prev => ({ ...prev, [key]: false }));
  };

  const handleDeployTask = async (templateName: string, taskId: string) => {
    const key = `${templateName}-${taskId}`;
    setLoadingTasks(prev => ({ ...prev, [key]: true }));
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "DEPLOY_TASK:${templateName}:${taskId}"`);
    setLoadingTasks(prev => ({ ...prev, [key]: false }));
  };

  const handleSetTaskIcons = async (filename: string, taskId: string, icons: string[]) => {
    const key = `set-icon-${filename}-${taskId}`;
    setLoadingTasks(prev => ({ ...prev, [key]: true }));
    const iconsStr = icons.join(',');
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "SET_TEMPLATE_TASK_ICON:${filename}:${taskId}:${iconsStr}"`);
    setLoadingTasks(prev => ({ ...prev, [key]: false }));
    onAction?.();
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    if (type === 'template') {
      const newTemplates = Array.from(localTemplates);
      const [removed] = newTemplates.splice(source.index, 1);
      newTemplates.splice(destination.index, 0, removed);
      
      setLocalTemplates(newTemplates);
      const newOrderStr = newTemplates.map(t => t.filename).join(',');
      // @ts-ignore
      await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "REORDER_TEMPLATES:${newOrderStr}"`);
      onAction?.();
    } else if (type === 'task') {
      const templateFilename = source.droppableId.replace('tasks-', '');
      const templateIndex = localTemplates.findIndex(t => t.filename === templateFilename);
      
      if (templateIndex === -1) return;
      
      const newTemplates = [...localTemplates];
      const template = { ...newTemplates[templateIndex] };
      const newTasks = Array.from(template.tasks || []);
      
      const [removed] = newTasks.splice(source.index, 1);
      newTasks.splice(destination.index, 0, removed);
      
      template.tasks = newTasks;
      newTemplates[templateIndex] = template;
      
      setLocalTemplates(newTemplates);
      // @ts-ignore
      await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "MOVE_TASK:${templateFilename}:${removed.id}:${destination.index}"`);
      onAction?.();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if a modal is open
      if (showCreateModal || showIconPicker) return;
      if (flatItems.length === 0) return;

      // Handle Arrow keys and Ctrl+J / Ctrl+K (Vim-like navigation)
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[focusedIndex];
        if (item.type === 'template') {
          if (e.ctrlKey) {
            handleDeployTemplate(item.id, item.name);
          } else {
            toggleExpand(item.id);
          }
        } else if (item.type === 'task') {
          handleDeployTask(item.templateName!, item.taskId!);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatItems, focusedIndex, showCreateModal, showIconPicker]);

  const prevQueryRef = useRef(query);
  
  // Reset focus when query changes
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      prevQueryRef.current = query;
      if (!query) {
        setFocusedIndex(0);
        return;
      }
      
      const lowerQuery = query.toLowerCase();
      
      const fuzzyMatch = (str: string, q: string) => {
        let i = 0;
        for (let j = 0; j < str.length && i < q.length; j++) {
          if (str[j] === q[i]) i++;
        }
        return i === q.length;
      };

      // Find the best item to focus: prioritize an exact start match, then an includes match, then fuzzy match
      const startsWithIndex = flatItems.findIndex(item => item.name.toLowerCase().startsWith(lowerQuery));
      if (startsWithIndex !== -1) {
        setFocusedIndex(startsWithIndex);
      } else {
        const includesIndex = flatItems.findIndex(item => item.name.toLowerCase().includes(lowerQuery));
        if (includesIndex !== -1) {
          setFocusedIndex(includesIndex);
        } else {
          const fuzzyIndex = flatItems.findIndex(item => fuzzyMatch(item.name.toLowerCase(), lowerQuery));
          if (fuzzyIndex !== -1) {
            setFocusedIndex(fuzzyIndex);
          } else {
            setFocusedIndex(0);
          }
        }
      }
    }
  }, [query, flatItems]);

  // Auto-scroll into view
  useEffect(() => {
    const focusedEl = document.getElementById(`flat-item-${focusedIndex}`);
    if (focusedEl && containerRef.current) {
      const container = containerRef.current;
      const rect = focusedEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
        focusedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', overflowY: 'auto', height: '100%', scrollBehavior: 'smooth' }}>
      {filteredTemplates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', background: 'rgba(7, 54, 66, 0.3)', borderRadius: '12px', border: '1px dashed var(--border-glass)' }}>
          {query ? 'No matching scripts or templates found' : 'No templates found in ~/.config/desktop-manager/templates'}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="temps-list" type="template" isDropDisabled={!!query}>
            {(provided) => (
              <div 
                {...provided.droppableProps}
                ref={provided.innerRef}
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                {filteredTemplates.map((temp, index) => {
                  const isExpanded = query ? true : expandedTemps.includes(temp.filename);
                  const templateFlatIndex = flatItems.findIndex(i => i.id === temp.filename && i.type === 'template');
                  const isTemplateFocused = focusedIndex === templateFlatIndex;

                  return (
                    <Draggable key={temp.filename} draggableId={temp.filename} index={index} isDragDisabled={!!query}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={temp.isDivider ? '' : `unified-glass-card ${isTemplateFocused ? 'lifted-card' : ''}`}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1,
                            ...(temp.isDivider ? {
                              background: 'transparent',
                              border: 'none',
                              boxShadow: 'none'
                            } : {
                              border: isTemplateFocused ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                              background: isTemplateFocused ? 'rgba(38, 139, 210, 0.08)' : 'rgba(7, 54, 66, 0.45)',
                              boxShadow: isTemplateFocused ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(38, 139, 210, 0.1)' : 'none'
                            })
                          }}
                        >
                          {isTemplateFocused && (
                            <div style={{
                              position: 'absolute',
                              left: 0,
                              top: '12%',
                              bottom: '12%',
                              width: '3px',
                              background: 'var(--aurora-pillar)',
                              borderRadius: '0 4px 4px 0',
                              boxShadow: 'var(--aurora-glow)',
                              zIndex: 10
                            }} />
                          )}
                          {temp.isDivider ? (
                            <div
                              id={`flat-item-${templateFlatIndex}`}
                              className="interactive-element"
                              {...provided.dragHandleProps}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                padding: '6px 12px',
                                background: isTemplateFocused ? 'rgba(133, 153, 0, 0.1)' : 'transparent',
                                borderRadius: '11px',
                                cursor: 'grab'
                              }}
                            >
                              <div style={{ flex: 1, height: '1px', background: 'var(--accent-green)', opacity: 0.3 }} />
                              
                              <button 
                                className="btn-hover"
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  if (setPromptConfig) {
                                    setPromptConfig({
                                    title: `Are you sure you want to delete divider "${temp.name}"?`,
                                    defaultValue: '',
                                    command: `DELETE_TEMPLATE:${temp.filename}`,
                                      isConfirm: true
                                    });
                                  }
                                }}
                                disabled={loadingTasks[`delete-temp-${temp.filename}`]}
                                style={{ backgroundColor: 'rgba(220, 50, 47, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(220, 50, 47, 0.2)', width: '20px', height: '20px', padding: 0 }}
                                title="Delete Divider"
                              >
                                {loadingTasks[`delete-temp-${temp.filename}`] ? <IconLoader size={10} /> : <IconTrash size={10} />}
                              </button>
                            </div>
                          ) : (
                            <>
                            {/* Template Header */}
                            <div 
                              id={`flat-item-${templateFlatIndex}`}
                              {...provided.dragHandleProps}
                            onClick={() => toggleExpand(temp.filename)}
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              padding: '8px 12px',
                              cursor: 'grab',
                              transition: 'all 0.2s ease',
                              background: isTemplateFocused ? 'rgba(38, 139, 210, 0.05)' : 'transparent',
                              borderTopLeftRadius: '11px',
                              borderTopRightRadius: '11px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ 
                                width: '24px', 
                                height: '24px', 
                      borderRadius: '6px', 
                      background: 'rgba(38, 139, 210, 0.1)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: 'var(--accent-blue)'
                    }}>
                      {isExpanded ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: isTemplateFocused ? 'var(--accent-cyan)' : 'var(--text-main)' }}>{temp.name}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: '600' }}>
                          {temp.tasks?.length || 0} Scripts
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', marginRight: '4px' }}>
                      <button 
                        className="btn-hover"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (setPromptConfig) {
                            setPromptConfig({ 
                              title: `Create Script in ${temp.name}`, 
                              description: 'Path: ~/.local/bin/Scripts/', 
                              defaultValue: 'my_new_script.sh', 
                              command: `CREATE_SCRIPT_TO_TEMPLATE:${temp.filename}` 
                            });
                          }
                        }}
                        style={{ backgroundColor: 'rgba(38, 139, 210, 0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(38, 139, 210, 0.2)', width: '24px', height: '24px', padding: 0 }}
                        title="Create Script"
                      >
                        <IconTerminal size={14} />
                      </button>
                      <button 
                        className="btn-hover"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          // @ts-ignore
                          const scriptPath = await window.electronAPI.nativeAction('select-file');
                          if (scriptPath) {
                            const key = `import-script-${temp.filename}`;
                            setLoadingTasks(prev => ({ ...prev, [key]: true }));
                            // @ts-ignore
                            await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "IMPORT_SCRIPT_TO_TEMPLATE:${temp.filename}:${scriptPath}"`);
                            setLoadingTasks(prev => ({ ...prev, [key]: false }));
                            onAction?.();
                          }
                        }}
                        disabled={loadingTasks[`import-script-${temp.filename}`]}
                        style={{ backgroundColor: 'rgba(133, 153, 0, 0.1)', color: 'var(--accent-green)', border: '1px solid rgba(133, 153, 0, 0.2)', width: '24px', height: '24px', padding: 0 }}
                        title="Import Script"
                      >
                        {loadingTasks[`import-script-${temp.filename}`] ? <IconLoader size={12} /> : <IconImport size={14} />}
                      </button>
                      <button 
                        className="btn-hover"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if (setPromptConfig) {
                            setPromptConfig({
                              title: `Are you sure you want to delete template "${temp.name}"?`,
                              defaultValue: '',
                              command: `DELETE_TEMPLATE:${temp.filename}`,
                              isConfirm: true
                            });
                          }
                        }}
                        disabled={loadingTasks[`delete-temp-${temp.filename}`]}
                        style={{ backgroundColor: 'rgba(220, 50, 47, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(220, 50, 47, 0.2)', width: '24px', height: '24px', padding: 0 }}
                        title="Delete Template"
                      >
                        {loadingTasks[`delete-temp-${temp.filename}`] ? <IconLoader size={12} /> : <IconTrash size={14} />}
                      </button>
                    </div>

                    <button 
                      className="btn-hover"
                      onClick={(e) => { e.stopPropagation(); handleDeployTemplate(temp.filename, temp.name); }}
                      disabled={loadingTasks[temp.name]}
                      style={{ 
                        background: 'var(--aurora-gradient)', 
                        color: 'var(--accent-cyan)', 
                        border: '1px solid rgba(42, 161, 152, 0.3)', 
                        borderRadius: '6px', 
                        padding: '6px 12px', 
                        fontSize: '11px', 
                        fontWeight: '800', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isTemplateFocused ? '0 0 10px rgba(42, 161, 152, 0.2)' : 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      {loadingTasks[temp.name] ? <IconLoader size={12} /> : <IconMonitor size={12} />} 
                      {loadingTasks[temp.name] ? '...' : 'Deploy All'}
                    </button>
                  </div>
                </div>

                        {/* Tasks List */}
                        {isExpanded && (
                          <Droppable droppableId={`tasks-${temp.filename}`} type="task" isDropDisabled={!!query}>
                            {(provided) => (
                              <div 
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  padding: '4px 8px 8px 8px', 
                                  gap: '4px', 
                                  background: 'rgba(0, 0, 0, 0.15)',
                                  borderBottomLeftRadius: '11px',
                                  borderBottomRightRadius: '11px',
                                  borderTop: '1px solid var(--border-glass)'
                                }}
                              >
                        {temp.tasks && temp.tasks.length > 0 ? temp.tasks.map((task, taskIndex) => {
                          const taskId = `${temp.filename}-${task.id}`;
                          const taskFlatIndex = flatItems.findIndex(i => i.id === taskId && i.type === 'task');
                          const isTaskFocused = focusedIndex === taskFlatIndex;

                          return (
                            <Draggable key={task.id} draggableId={`task-${temp.filename}-${task.id}`} index={taskIndex} isDragDisabled={!!query}>
                              {(provided, snapshot) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  id={`flat-item-${taskFlatIndex}`}
                                  className="interactive-element"
                                  style={{ 
                                    ...provided.draggableProps.style,
                                    opacity: snapshot.isDragging ? 0.8 : 1,
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '10px', 
                                    backgroundColor: isTaskFocused ? 'rgba(38, 139, 210, 0.1)' : 'transparent',
                                    padding: '6px 12px', 
                                    borderRadius: '6px',
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    cursor: 'grab'
                                  }}
                                >
                                  {isTaskFocused && (
                            <div style={{
                              position: 'absolute',
                              left: 0,
                              top: '20%',
                              bottom: '20%',
                              width: '2px',
                              background: 'var(--accent-cyan)',
                              borderRadius: '0 2px 2px 0',
                              boxShadow: '0 0 8px rgba(42, 161, 152, 0.4)',
                            }} />
                          )}
                          <div style={{ color: isTaskFocused ? 'var(--accent-cyan)' : 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '16px' }}>
                            {(task.icons && task.icons.length > 0) || task.icon ? (
                              <ManualIcon icon={task.icons || task.icon} size={16} />
                            ) : (
                              <IconTerminal size={12} />
                            )}
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: isTaskFocused ? 'var(--text-main)' : '#a9b1d6', fontWeight: isTaskFocused ? '700' : '500' }}>{task.name}</span>
                            {task.isExecutable === false && (
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const cleanPath = task.script.replace(/^bash\s+['"]?/, '').replace(/['"]?$/, '');
                                  // @ts-ignore
                                  await window.electronAPI.executeCommand(`chmod +x "${cleanPath}"`);
                                  onAction?.();
                                }}
                                className="btn-hover"
                                style={{ fontSize: '10px', color: '#f7768e', background: 'rgba(247, 118, 142, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(247, 118, 142, 0.2)', fontWeight: '600', cursor: 'pointer' }} 
                                title="Click to make this script executable (chmod +x)."
                              >
                                +x Required
                              </button>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px', opacity: isTaskFocused ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                            <button 
                              className="btn-hover"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if (setPromptConfig) {
                                  setPromptConfig({ 
                                    title: `Rename Script`, 
                                    description: `Rename '${task.name}'. Include .sh if you want to change extension.`, 
                                    defaultValue: task.name, 
                                    command: `RENAME_TEMPLATE_SCRIPT:${temp.filename}:${task.id}` 
                                  });
                                }
                              }}
                              style={{ backgroundColor: 'rgba(108, 113, 196, 0.1)', color: 'var(--accent-purple)', border: '1px solid rgba(108, 113, 196, 0.2)', width: '24px', height: '24px', padding: 0 }}
                              title="Rename Script"
                            >
                              <IconType size={12} />
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const cleanPath = task.script.replace(/^bash\s+['"]?/, '').replace(/['"]?$/, '');
                                // @ts-ignore
                                window.electronAPI.executeCommand(`kate "${cleanPath}"`);
                              }}
                              style={{ backgroundColor: 'rgba(224, 175, 104, 0.1)', color: 'var(--accent-yellow, #e0af68)', border: '1px solid rgba(224, 175, 104, 0.2)', width: '24px', height: '24px', padding: 0 }}
                              title="Edit Script"
                            >
                              <IconPencil size={12} />
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                if (setPromptConfig) {
                                  setPromptConfig({
                                    title: `Are you sure you want to delete script "${task.name}"?`,
                                    defaultValue: '',
                                    command: `DELETE_TEMPLATE_TASK:${temp.filename}:${task.id}`,
                                    isConfirm: true
                                  });
                                }
                              }}
                              disabled={loadingTasks[`delete-task-${taskId}`]}
                              style={{ backgroundColor: 'rgba(220, 50, 47, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(220, 50, 47, 0.2)', width: '24px', height: '24px', padding: 0 }}
                              title="Delete Script"
                            >
                              {loadingTasks[`delete-task-${taskId}`] ? <IconLoader size={12} /> : <IconTrash size={12} />}
                            </button>
                             <button 
                              className="btn-hover"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setShowIconPicker({ filename: temp.filename, taskId: task.id });
                              }}
                              disabled={loadingTasks[`set-icon-${temp.filename}-${task.id}`]}
                              style={{ backgroundColor: 'rgba(108, 113, 196, 0.1)', color: 'var(--accent-purple, var(--accent-purple))', border: '1px solid rgba(108, 113, 196, 0.2)', width: '24px', height: '24px', padding: 0 }}
                              title="Set Icon"
                            >
                              {loadingTasks[`set-icon-${temp.filename}-${task.id}`] ? <IconLoader size={12} /> : <IconRocket size={12} />}
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                if (setPromptConfig) {
                                  setPromptConfig({
                                    title: 'Global Shortcut (e.g. Control+Alt+1)',
                                    defaultValue: task.shortcut || '',
                                    command: `SET_TEMPLATE_TASK_SHORTCUT:${temp.filename}:${task.id}`
                                  });
                                }
                              }}
                              style={{ 
                                backgroundColor: task.shortcut ? 'rgba(38, 139, 210, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                                color: task.shortcut ? 'var(--accent-blue)' : 'var(--text-dim)', 
                                border: '1px solid rgba(38, 139, 210, 0.2)', 
                                width: '24px', 
                                height: '24px', 
                                padding: 0 
                              }}
                              title={task.shortcut ? `Hotkey: ${task.shortcut}` : "Set Hotkey"}
                            >
                              <IconKeyboard size={12} />
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                handleDeployTask(temp.name, task.id);
                              }}
                              disabled={loadingTasks[`${temp.name}-${task.id}`]}
                              style={{ 
                                backgroundColor: isTaskFocused ? 'rgba(38, 139, 210, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                                color: 'var(--accent-blue)', 
                                border: '1px solid rgba(38, 139, 210, 0.2)', 
                                borderRadius: '4px', 
                                padding: '3px 10px', 
                                fontSize: '10px', 
                                fontWeight: '800',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {loadingTasks[`${temp.name}-${task.id}`] ? <IconLoader size={10} /> : <IconMonitor size={10} />} 
                              TO LIVE
                            </button>
                          </div>
                                </div>
                              )}
                            </Draggable>
                            );
                          }) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '10px', textAlign: 'center' }}>No scripts in this template.</div>
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                  </>
                )}
              </div>
            )}
          </Draggable>
          );
        })}
        {provided.placeholder}
        </div>
        )}
        </Droppable>
        </DragDropContext>
      )}

      {showCreateModal && (
        <CreateTemplateScriptModal
          existingTemplates={localTemplates.filter(t => !t.isDivider).map(t => ({ filename: t.filename, name: t.name }))}
          onCancel={() => setShowCreateModal(false)}
          onSubmit={async (scriptName, templateName, isNewTemplate, icon) => {
            let filename = templateName.toLowerCase().replace(/\s+/g, '_') + '.json';
            
            if (isNewTemplate) {
              // @ts-ignore
              await window.electronAPI.executeCommand(`npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "CREATE_TEMPLATE:${templateName}"`);
              // Wait a bit to ensure it's created before adding script
              await new Promise(r => setTimeout(r, 200));
            }

            // Create script and add to template, optionally with icon
            let cmd = `npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "CREATE_SCRIPT_TO_TEMPLATE:${filename}:${scriptName}"`;
            if (icon) {
              cmd = `npx tsx "/home/dod/Projects/My_Desktop_Manager/shared_backend/cli.ts" "CREATE_SCRIPT_TO_TEMPLATE:${filename}:${scriptName}:${icon}"`;
            }
            
            // @ts-ignore
            await window.electronAPI.executeCommand(cmd);
            
            setShowCreateModal(false);
            setExpandedTemps(prev => prev.includes(filename) ? prev : [...prev, filename]);
            onAction?.();
          }}
        />
      )}

      {showIconPicker && (
        <IconPicker 
          title="Select Script Icons"
          currentIcons={(() => {
            const temp = templates.find(t => t.filename === showIconPicker.filename);
            const task = temp?.tasks?.find(tk => tk.id === showIconPicker.taskId);
            return task?.icons || (task?.icon ? [task.icon] : []);
          })()}
          onToggle={(icon) => {
            const temp = templates.find(t => t.filename === showIconPicker.filename);
            const task = temp?.tasks?.find(tk => tk.id === showIconPicker.taskId);
            const current = task?.icons || (task?.icon ? [task.icon] : []);
            const next = current.includes(icon) 
              ? current.filter(i => i !== icon) 
              : [...current, icon];
            handleSetTaskIcons(showIconPicker.filename, showIconPicker.taskId, next);
          }}
          onClear={() => handleSetTaskIcons(showIconPicker.filename, showIconPicker.taskId, [])}
          onClose={() => setShowIconPicker(null)}
        />
      )}
    </div>
  );
}
