import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { IconFolder, IconFolderOpen, IconPlus, IconCheck, IconSquare, IconChevronRight, IconChevronDown, IconTrash, IconGrip, IconPencil, IconInbox, IconRadio, IconLayers, IconSlash } from './Icons';
import CreateTaskModal from './CreateTaskModal';
import PromptModal from './PromptModal';

interface Task {
  id: string;
  text: string;
  checked: boolean;
}

interface TasksData {
  general: Task[];
  live: Record<string, Task[]>;
  templates: Record<string, Task[]>;
  expanded_categories: string[];
}

export default function TasksTab({ isActive, tasksData, sessionData, templates, searchQuery = '', onAction }: { isActive: boolean, tasksData: any, sessionData: any, templates: any[], searchQuery?: string, onAction?: () => void }) {
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const [data, setData] = useState<TasksData>({
    general: [],
    live: {},
    templates: {},
    expanded_categories: ['general', 'live', 'templates']
  });

  const [activeCategory, setActiveCategory] = useState<'general' | 'live' | 'templates'>('general');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(-1);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => setSelectedIndex(0), [searchQuery]);

  // Reset selected task when active tasks change
  useEffect(() => {
    setSelectedTaskIndex(-1);
  }, [activeCategory, activeSubId, searchQuery]);

  useEffect(() => {
    if (!isActive) return;
    const handleCreateNew = () => setShowCreateModal(true);
    window.addEventListener('tasks-create-new', handleCreateNew as EventListener);
    return () => window.removeEventListener('tasks-create-new', handleCreateNew as EventListener);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent | React.KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setIsSidebarOpen(true);
        window.dispatchEvent(new CustomEvent('focus-global-search'));
      } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleGlobalTyping = (e: KeyboardEvent) => {
      // If the sidebar is closed and we are NOT actively navigating tasks
      if (!isSidebarOpen && selectedTaskIndex === -1) {
        e.preventDefault(); // Stop App.tsx from focusing the global search bar
        if (newTaskInputRef.current) {
          newTaskInputRef.current.focus();
        }
      }
      // If we ARE navigating tasks, we still prevent default so it doesn't focus search,
      // but we don't focus the new task input.
      else if (!isSidebarOpen && selectedTaskIndex !== -1) {
        e.preventDefault();
      }
    };
    window.addEventListener('global-typing-intercept', handleGlobalTyping as EventListener);
    return () => window.removeEventListener('global-typing-intercept', handleGlobalTyping as EventListener);
  }, [isActive, isSidebarOpen, selectedTaskIndex]);
  
  useEffect(() => {
    if (tasksData) {
      setData({
        general: tasksData.general || [],
        live: tasksData.live || {},
        templates: tasksData.templates || {},
        expanded_categories: tasksData.expanded_categories || ['general', 'live', 'templates']
      });
    }
  }, [tasksData]);

  const writeData = async (newData: TasksData) => {
    setData(newData);
    // @ts-ignore
    await window.electronAPI.writeJSON('tasks.json', newData);
    if (onAction) onAction();
  };

  const toggleCategory = (cat: string) => {
    const newExpanded = data.expanded_categories.includes(cat)
      ? data.expanded_categories.filter(c => c !== cat)
      : [...data.expanded_categories, cat];
    writeData({ ...data, expanded_categories: newExpanded });
  };

  const handleAddTask = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTaskText.trim()) {
      const newTask: Task = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: newTaskText.trim(),
        checked: false
      };

      const newData = { ...data };
      if (activeCategory === 'general') {
        newData.general = [...newData.general, newTask];
      } else if (activeCategory === 'live' && activeSubId) {
        if (!newData.live[activeSubId]) newData.live[activeSubId] = [];
        newData.live[activeSubId] = [...newData.live[activeSubId], newTask];
      } else if (activeCategory === 'templates' && activeSubId) {
        if (!newData.templates[activeSubId]) newData.templates[activeSubId] = [];
        newData.templates[activeSubId] = [...newData.templates[activeSubId], newTask];
      }

      writeData(newData);
      setNewTaskText('');
    }
  };

  const toggleTask = (taskId: string) => {
    const newData = { ...data };
    let tasksList: Task[] = [];
    
    if (activeCategory === 'general') {
      tasksList = newData.general;
    } else if (activeCategory === 'live' && activeSubId) {
      tasksList = newData.live[activeSubId] || [];
    } else if (activeCategory === 'templates' && activeSubId) {
      tasksList = newData.templates[activeSubId] || [];
    }

    const taskIndex = tasksList.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      tasksList[taskIndex] = { ...tasksList[taskIndex], checked: !tasksList[taskIndex].checked };
      writeData(newData);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const newData = { ...data };
    let tasksList: Task[] = [];
    if (activeCategory === 'general') {
      tasksList = newData.general;
    } else if (activeCategory === 'live' && activeSubId) {
      tasksList = newData.live[activeSubId] || [];
    } else if (activeCategory === 'templates' && activeSubId) {
      tasksList = newData.templates[activeSubId] || [];
    }
    const filtered = tasksList.filter(t => t.id !== taskId);
    if (activeCategory === 'general') {
      newData.general = filtered;
    } else if (activeCategory === 'live' && activeSubId) {
      newData.live[activeSubId] = filtered;
    } else if (activeCategory === 'templates' && activeSubId) {
      newData.templates[activeSubId] = filtered;
    }
    writeData(newData);
  };

  const handleSaveEdit = (taskId: string) => {
    if (!editingTaskText.trim()) return;
    const newData = { ...data };
    let tasksList: Task[] = [];
    if (activeCategory === 'general') {
      tasksList = newData.general;
    } else if (activeCategory === 'live' && activeSubId) {
      tasksList = newData.live[activeSubId] || [];
    } else if (activeCategory === 'templates' && activeSubId) {
      tasksList = newData.templates[activeSubId] || [];
    }
    const taskIndex = tasksList.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      tasksList[taskIndex] = { ...tasksList[taskIndex], text: editingTaskText.trim() };
      writeData(newData);
    }
    setEditingTaskId(null);
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;
    
    if (source.droppableId !== destination.droppableId) return;
    if (source.index === destination.index) return;

    const newData = { ...data };
    let tasksList: Task[] = [];
    
    if (activeCategory === 'general') {
      tasksList = [...newData.general];
    } else if (activeCategory === 'live' && activeSubId) {
      tasksList = [...(newData.live[activeSubId] || [])];
    } else if (activeCategory === 'templates' && activeSubId) {
      tasksList = [...(newData.templates[activeSubId] || [])];
    }

    const [removed] = tasksList.splice(source.index, 1);
    tasksList.splice(destination.index, 0, removed);

    if (activeCategory === 'general') {
      newData.general = tasksList;
    } else if (activeCategory === 'live' && activeSubId) {
      newData.live[activeSubId] = tasksList;
    } else if (activeCategory === 'templates' && activeSubId) {
      newData.templates[activeSubId] = tasksList;
    }

    writeData(newData);
  };

  const getActiveTasks = () => {
    let tasks: Task[] = [];
    if (activeCategory === 'general') tasks = data.general || [];
    if (activeCategory === 'live' && activeSubId) tasks = data.live[activeSubId] || [];
    if (activeCategory === 'templates' && activeSubId) tasks = data.templates[activeSubId] || [];
    
    if (searchQuery && !isSidebarOpen) {
      tasks = tasks.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return tasks;
  };

  const getUnfinishedCount = (cat: 'general' | 'live' | 'templates', subId?: string) => {
    let tasks: Task[] = [];
    if (cat === 'general') tasks = data.general || [];
    else if (cat === 'live' && subId) tasks = data.live[subId] || [];
    else if (cat === 'templates' && subId) tasks = data.templates[subId] || [];
    return tasks.filter(t => !t.checked).length;
  };

  const activeTasks = getActiveTasks();

  const selectCategory = (category: 'general' | 'live' | 'templates', subId: string | null) => {
    setActiveCategory(category);
    setActiveSubId(subId);
    setTimeout(() => {
      if (newTaskInputRef.current) {
        newTaskInputRef.current.focus();
      }
    }, 10);
  };

  // Compute visible items for keyboard navigation highlighting
  const visibleItems: { type: 'general' | 'live' | 'templates', id: string | null }[] = [];
  if (!isSidebarOpen || !searchQuery || 'general tasks'.includes(searchQuery.toLowerCase())) {
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
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isSidebarOpen, selectedIndex, visibleItems]);

  useEffect(() => {
    if (!isActive || isSidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (activeTasks.length > 0) {
          setSelectedTaskIndex(prev => {
            const next = prev + 1;
            if (next >= activeTasks.length) {
              newTaskInputRef.current?.focus();
              return -1;
            } else {
              newTaskInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return next;
            }
          });
        }
        return;
      } else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (activeTasks.length > 0) {
          setSelectedTaskIndex(prev => {
            const next = prev - 1;
            if (next < -1) {
              newTaskInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return activeTasks.length - 1;
            } else if (next === -1) {
              newTaskInputRef.current?.focus();
              return -1;
            } else {
              newTaskInputRef.current?.blur();
              (document.activeElement as HTMLElement)?.blur();
              return next;
            }
          });
        }
        return;
      }

      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      
      if (isInputFocused) return;

      if (e.key === 'Enter') {
        if (selectedTaskIndex >= 0 && selectedTaskIndex < activeTasks.length) {
          e.preventDefault();
          const task = activeTasks[selectedTaskIndex];
          if (e.ctrlKey) {
            toggleTask(task.id);
          } else {
            setEditingTaskId(task.id);
            setEditingTaskText(task.text);
          }
        }
      } else if (e.key.toLowerCase() === 'd') {
        if (selectedTaskIndex >= 0 && selectedTaskIndex < activeTasks.length) {
          e.preventDefault();
          const task = activeTasks[selectedTaskIndex];
          setTaskToDelete(task.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isSidebarOpen, selectedTaskIndex, activeTasks]);

  useEffect(() => {
    if (selectedTaskIndex >= 0) {
      const el = document.getElementById(`task-item-${selectedTaskIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedTaskIndex]);

  const isHighlighted = (type: string, id: string | null) => {
    if (!isSidebarOpen || visibleItems.length === 0) return false;
    const current = visibleItems[selectedIndex];
    return current && current.type === type && current.id === id;
  };

  return (
        <div id="tasks-tab-container" style={{ flex: 1, display: 'flex', height: '100%', backgroundColor: 'var(--bg-main)', minWidth: 0 }}>
      {/* Sidebar */}
      <div style={{
        width: isSidebarOpen ? '180px' : '0px',
        opacity: isSidebarOpen ? 1 : 0,
        backgroundColor: 'rgba(0, 33, 43, 0.4)',
        borderRight: isSidebarOpen ? '1px solid var(--border-glass)' : '0px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        padding: isSidebarOpen ? '16px 12px' : '16px 0',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        visibility: isSidebarOpen ? 'visible' : 'hidden',
        whiteSpace: 'nowrap'
      }}>
          {/* General Tasks */}
          {(!isSidebarOpen || !searchQuery || 'general tasks'.includes(searchQuery.toLowerCase())) && (
          <div 
            className="interactive-element"
            onClick={() => { selectCategory('general', null); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { selectCategory('general', null); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); } }}
            tabIndex={0}
            style={{
              padding: '6px 12px',
              margin: '2px 0',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor: activeCategory === 'general' || isHighlighted('general', null) ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
              boxShadow: isHighlighted('general', null) ? 'inset 0 0 0 1px var(--accent-blue)' : 'none',
              color: activeCategory === 'general' ? 'var(--accent-blue)' : 'var(--text-main)',
              fontSize: '13px',
              fontWeight: activeCategory === 'general' ? '700' : '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ 
              backgroundColor: activeCategory === 'general' ? 'var(--accent-blue)' : (getUnfinishedCount('general') === 0 ? 'rgba(88, 110, 117, 0.15)' : 'rgba(181, 137, 0, 0.15)'), 
              color: activeCategory === 'general' ? '#fff' : (getUnfinishedCount('general') === 0 ? 'var(--text-dim)' : 'var(--accent-yellow)'), 
              padding: '2px 6px', 
              borderRadius: '10px', 
              fontSize: '10px', 
              fontWeight: 'bold',
              minWidth: '14px',
              textAlign: 'center',
              lineHeight: '1'
            }}>
              {getUnfinishedCount('general')}
            </span>
            <IconSlash size={14} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>General Tasks</span>
          </div>
          )}

          {/* Templates */}
          <div>
            {templateItems.map((template: any) => {
              const isActive = activeCategory === 'templates' && activeSubId === template.name;
              return (
                <div 
                  key={template.name}
                  className="interactive-element"
                  onClick={() => { selectCategory('templates', template.name); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { selectCategory('templates', template.name); setIsSidebarOpen(false); window.dispatchEvent(new CustomEvent('clear-search-query')); } }}
                  tabIndex={0}
                  style={{
                    padding: '6px 12px',
                    margin: '2px 0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isActive || isHighlighted('templates', template.name) ? 'rgba(38, 139, 210, 0.15)' : 'transparent',
                    boxShadow: isHighlighted('templates', template.name) ? 'inset 0 0 0 1px var(--accent-blue)' : 'none',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-main)',
                    fontSize: '13px',
                    fontWeight: isActive ? '700' : '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{ 
                    backgroundColor: isActive ? 'var(--accent-blue)' : (getUnfinishedCount('templates', template.name) === 0 ? 'rgba(88, 110, 117, 0.15)' : 'rgba(181, 137, 0, 0.15)'), 
                    color: isActive ? '#fff' : (getUnfinishedCount('templates', template.name) === 0 ? 'var(--text-dim)' : 'var(--accent-yellow)'), 
                    padding: '2px 6px', 
                    borderRadius: '10px', 
                    fontSize: '10px', 
                    fontWeight: 'bold',
                    minWidth: '14px',
                    textAlign: 'center',
                    lineHeight: '1'
                  }}>
                    {getUnfinishedCount('templates', template.name)}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</span>
                </div>
              );
            })}
          </div>
        </div>

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
                <IconSlash size={18} color="var(--accent-blue)" /> General Tasks
              </>
            )}
            {activeCategory === 'live' && (
              <>
                <IconRadio size={18} color="var(--accent-green)" /> {activeSubId || 'Live Tasks'}
              </>
            )}
            {activeCategory === 'templates' && (
              <>
                <IconLayers size={18} color="var(--accent-yellow)" /> {activeSubId}
              </>
            )}
          </h2>
          <p style={{ margin: '4px 0 0 32px', color: 'var(--text-dim)', fontSize: '12px' }}>
            {activeCategory === 'templates' ? 'Manage the tasks associated with this template.' : 'Manage your active tasks and to-dos.'}
          </p>
        </div>

        {/* Task List */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          {activeTasks.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '13px' }}>
              No tasks here yet. Press enter below to add one!
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="tasks-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '10px', minWidth: 0 }}>
                    {activeTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            id={`task-item-${index}`}
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className="interactive-element"
                            style={{
                              ...provided.draggableProps.style,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              backgroundColor: snapshot.isDragging ? 'rgba(0, 43, 54, 0.8)' : 'rgba(0, 43, 54, 0.4)',
                              border: snapshot.isDragging || selectedTaskIndex === index ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                              boxShadow: selectedTaskIndex === index ? 'inset 0 0 0 1px var(--accent-blue)' : (snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : 'none'),
                              borderRadius: '8px',
                              transition: `${provided.draggableProps.style?.transition ? provided.draggableProps.style.transition + ', ' : ''}background-color 0.2s ease, border 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease`,
                              opacity: task.checked ? 0.6 : 1,
                              minWidth: 0
                            }}
                          >
                            <div 
                              {...provided.dragHandleProps}
                              style={{ color: 'var(--text-dim)', cursor: 'grab', opacity: hoveredTaskId === task.id || snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s', display: 'flex' }}
                            >
                              <IconGrip size={14} />
                            </div>
                            
                            <div 
                              onClick={() => toggleTask(task.id)}
                              style={{ cursor: 'pointer', color: task.checked ? 'var(--accent-green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {task.checked ? <IconCheck size={16} /> : <IconSquare size={16} />}
                            </div>

                            <div 
                              style={{ flex: 1, overflow: 'hidden', cursor: 'text', minWidth: 0 }}
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setEditingTaskText(task.text);
                              }}
                            >
                              {editingTaskId === task.id ? (
                                <textarea 
                                  autoFocus
                                  value={editingTaskText}
                                  onChange={(e) => setEditingTaskText(e.target.value)}
                                  onKeyDown={(e) => {
                                    // Submit on Enter without Shift
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleSaveEdit(task.id);
                                    }
                                    if (e.key === 'Escape') setEditingTaskId(null);
                                  }}
                                  onBlur={() => {
                                    if (!isActiveRef.current) return;
                                    setTimeout(() => {
                                      const container = document.getElementById('tasks-tab-container');
                                      if (container && !container.contains(document.activeElement)) return;
                                      handleSaveEdit(task.id);
                                    }, 0);
                                  }}
                                  style={{
                                    width: '100%',
                                    minHeight: '60px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                    border: '1px solid var(--accent-blue)',
                                    borderRadius: '4px',
                                    padding: '6px 8px',
                                    color: 'var(--text-main)',
                                    fontSize: '13px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                  }}
                                />
                              ) : (
                                <div style={{ 
                                  color: task.checked ? 'var(--text-dim)' : 'var(--text-main)', 
                                  fontSize: '13px',
                                  textDecoration: task.checked ? 'line-through' : 'none',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {task.text}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '8px', opacity: (hoveredTaskId === task.id || selectedTaskIndex === index) && !snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s' }}>
                              <div 
                                className="action-btn"
                                onClick={() => setTaskToDelete(task.id)}
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
        <div className="new-item-container" style={{ marginTop: '12px', position: 'relative' }}>
          <div className="new-item-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <IconPlus size={14} />
          </div>
          <input
            ref={newTaskInputRef}
            type="text"
            className="new-item-input"
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            onKeyDown={handleAddTask}
            placeholder={`Add a new task to ${activeCategory === 'general' ? 'General' : activeSubId}...`}
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
        <CreateTaskModal
          existingLiveFolders={Object.keys(sessionData?.folders || {}).filter(k => k !== 'root').concat('root')}
          existingTemplates={templates.filter(t => !t.isDivider).map(t => t.name)}
          initialCategory={activeCategory}
          initialSubId={activeSubId}
          onSubmit={(taskName, category, subId) => {
            setShowCreateModal(false);
            const newTask: Task = {
              id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              text: taskName,
              checked: false
            };
            const newData = { ...data };
            if (category === 'general') {
              newData.general = [...newData.general, newTask];
            } else if (category === 'live' && subId) {
              if (!newData.live[subId]) newData.live[subId] = [];
              newData.live[subId] = [...newData.live[subId], newTask];
            } else if (category === 'templates' && subId) {
              if (!newData.templates[subId]) newData.templates[subId] = [];
              newData.templates[subId] = [...newData.templates[subId], newTask];
            }
            writeData(newData);
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {taskToDelete && (
        <PromptModal
          title="Delete Task"
          description="Are you sure you want to delete this task?"
          defaultValue=""
          isConfirm={true}
          onSubmit={() => {
            handleDeleteTask(taskToDelete);
            setTaskToDelete(null);
            setSelectedTaskIndex(prev => Math.min(prev, activeTasks.length - 2));
          }}
          onCancel={() => setTaskToDelete(null)}
        />
      )}
    </div>
  );
}
