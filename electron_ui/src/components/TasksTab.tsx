import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { IconFolder, IconFolderOpen, IconPlus, IconCheck, IconSquare, IconChevronRight, IconChevronDown, IconTrash, IconGrip, IconPencil } from './Icons';

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

export default function TasksTab({ tasksData, sessionData, templates, searchQuery = '', onAction }: { tasksData: any, sessionData: any, templates: any[], searchQuery?: string, onAction?: () => void }) {
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
  
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
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
    
    if (searchQuery) {
      tasks = tasks.filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return tasks;
  };

  const activeTasks = getActiveTasks();

  const selectCategory = (category: 'general' | 'live' | 'templates', subId: string | null) => {
    setActiveCategory(category);
    setActiveSubId(subId);
    setShowDropdown(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', backgroundColor: 'var(--bg-main)' }}>
      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px' }}>
        <div style={{ marginBottom: '24px', position: 'relative' }} ref={dropdownRef}>
          <h2 
            className="interactive-element"
            onClick={() => setShowDropdown(!showDropdown)}
            style={{ 
              margin: 0, 
              color: 'var(--text-main)', 
              fontSize: '24px', 
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
            {activeCategory === 'general' && "📥 General Tasks"}
            {activeCategory === 'live' && `🟢 ${activeSubId || 'Live Tasks'}`}
            {activeCategory === 'templates' && `🛠️ ${activeSubId}`}
            <div style={{ color: 'var(--text-dim)', display: 'flex', opacity: 0.7 }}>
              {showDropdown ? <IconChevronDown size={20} /> : <IconChevronRight size={20} />}
            </div>
          </h2>
          
          {/* Dropdown Menu */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '320px',
              backgroundColor: 'rgba(7, 54, 66, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 100,
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '12px'
            }}>
              {/* General Tasks */}
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
                📥 General Tasks
              </div>

              {/* Live Desktops */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '4px' }}>
                  🟢 LIVE DESKTOPS
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
                        {name}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Templates */}
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '4px' }}>
                  🛠️ TEMPLATES
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
                      {isActive ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                      {template.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-dim)', fontSize: '13px' }}>
            {activeCategory === 'templates' ? 'Tasks defined here will be copied to Live Desktops when this template is deployed.' : 'Manage your active tasks and to-dos.'}
          </p>
        </div>

        {/* Task List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeTasks.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '14px' }}>
              No tasks here yet. Press enter below to add one!
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="tasks-list">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '10px' }}>
                    {activeTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className="interactive-element"
                            style={{
                              ...provided.draggableProps.style,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 16px',
                              backgroundColor: snapshot.isDragging ? 'rgba(0, 43, 54, 0.8)' : 'rgba(0, 43, 54, 0.4)',
                              border: snapshot.isDragging ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                              borderRadius: '8px',
                              transition: snapshot.isDragging ? 'none' : 'all 0.2s ease',
                              opacity: task.checked ? 0.6 : 1,
                              boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : 'none'
                            }}
                          >
                            <div 
                              {...provided.dragHandleProps}
                              style={{ color: 'var(--text-dim)', cursor: 'grab', opacity: hoveredTaskId === task.id || snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s', display: 'flex' }}
                            >
                              <IconGrip size={18} />
                            </div>
                            
                            <div 
                              onClick={() => toggleTask(task.id)}
                              style={{ cursor: 'pointer', color: task.checked ? 'var(--accent-green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {task.checked ? <IconCheck size={20} /> : <IconSquare size={20} />}
                            </div>

                            <div 
                              style={{ flex: 1, overflow: 'hidden', cursor: 'text' }}
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
                                  onBlur={() => handleSaveEdit(task.id)}
                                  style={{
                                    width: '100%',
                                    minHeight: '60px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                    border: '1px solid var(--accent-blue)',
                                    borderRadius: '4px',
                                    padding: '6px 8px',
                                    color: 'var(--text-main)',
                                    fontSize: '14px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                  }}
                                />
                              ) : (
                                <div style={{ 
                                  color: task.checked ? 'var(--text-dim)' : 'var(--text-main)', 
                                  fontSize: '14px',
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
                            <div style={{ display: 'flex', gap: '8px', opacity: hoveredTaskId === task.id && !snapshot.isDragging ? 1 : 0, transition: 'opacity 0.2s' }}>
                              <div 
                                className="action-btn"
                                onClick={() => handleDeleteTask(task.id)}
                                style={{ color: 'var(--accent-red)', cursor: 'pointer', padding: '4px' }}
                                title="Delete"
                              >
                                <IconTrash size={16} />
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
        <div style={{ marginTop: '20px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-blue)', display: 'flex' }}>
            <IconPlus size={18} />
          </div>
          <input
            type="text"
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            onKeyDown={handleAddTask}
            placeholder={`Add a new task to ${activeCategory === 'general' ? 'General' : activeSubId}...`}
            style={{
              width: '100%',
              height: '48px',
              backgroundColor: 'rgba(0, 43, 54, 0.6)',
              border: '1px solid var(--accent-blue)',
              borderRadius: '8px',
              padding: '0 20px 0 46px',
              color: 'var(--text-main)',
              fontSize: '14px',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>
    </div>
  );
}
