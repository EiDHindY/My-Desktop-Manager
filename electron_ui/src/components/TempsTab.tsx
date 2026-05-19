import { useState, useEffect, useRef, useMemo } from 'react';
import { IconTerminal, IconPlay, IconFolder, IconFolderOpen, IconPencil, IconLoader, IconFilePlus, IconTrash, ManualIcon, IconRocket, IconKeyboard } from './Icons';
import IconPicker from './IconPicker';

interface Task {
  id: string;
  name: string;
  script: string;
  icon?: string;
  icons?: string[];
  shortcut?: string;
}

interface Template {
  name: string;
  filename: string;
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

export default function TempsTab({ templates, searchQuery, onAction }: { templates: Template[], searchQuery?: string, onAction?: () => void }) {
  const [expandedTemps, setExpandedTemps] = useState<string[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<Record<string, boolean>>({});
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [showIconPicker, setShowIconPicker] = useState<{ filename: string, taskId: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = (searchQuery || '').toLowerCase().trim();

  const filteredTemplates = useMemo(() => {
    return templates.map(temp => {
      if (!query) return temp;
      const nameMatch = temp.name.toLowerCase().includes(query);
      const matchingTasks = temp.tasks?.filter(t => t.name.toLowerCase().includes(query)) || [];
      if (nameMatch || matchingTasks.length > 0) {
        return { ...temp, tasks: nameMatch ? temp.tasks : matchingTasks };
      }
      return null;
    }).filter(Boolean) as Template[];
  }, [templates, query]);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    filteredTemplates.forEach(temp => {
      items.push({ type: 'template', id: temp.filename, name: temp.name, filename: temp.filename });
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

  const handleDeployTemplate = async (templateName: string) => {
    setLoadingTasks(prev => ({ ...prev, [templateName]: true }));
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DEPLOY_ALL:${templateName}"`);
    setLoadingTasks(prev => ({ ...prev, [templateName]: false }));
  };

  const handleDeployTask = async (templateName: string, taskId: string) => {
    const key = `${templateName}-${taskId}`;
    setLoadingTasks(prev => ({ ...prev, [key]: true }));
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DEPLOY_TASK:${templateName}:${taskId}"`);
    setLoadingTasks(prev => ({ ...prev, [key]: false }));
  };

  const handleSetTaskIcons = async (filename: string, taskId: string, icons: string[]) => {
    const key = `set-icon-${filename}-${taskId}`;
    setLoadingTasks(prev => ({ ...prev, [key]: true }));
    const iconsStr = icons.join(',');
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "SET_TEMPLATE_TASK_ICON:${filename}:${taskId}:${iconsStr}"`);
    setLoadingTasks(prev => ({ ...prev, [key]: false }));
    onAction?.();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          handleDeployTemplate(item.name);
        } else if (item.type === 'task') {
          handleDeployTask(item.templateName!, item.taskId!);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatItems, focusedIndex]);

  // Reset focus when query changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

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
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', background: 'rgba(30, 32, 48, 0.3)', borderRadius: '12px', border: '1px dashed var(--border-glass)' }}>
          {query ? 'No matching scripts or templates found' : 'No templates found in ~/.config/desktop-manager/templates'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredTemplates.map(temp => {
            const isExpanded = query ? true : expandedTemps.includes(temp.filename);
            const templateFlatIndex = flatItems.findIndex(i => i.id === temp.filename && i.type === 'template');
            const isTemplateFocused = focusedIndex === templateFlatIndex;

            return (
              <div 
                key={temp.filename}
                className={`unified-glass-card ${isTemplateFocused ? 'lifted-card' : ''}`}
                style={{
                  border: isTemplateFocused ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  background: isTemplateFocused ? 'rgba(122, 162, 247, 0.08)' : 'rgba(30, 32, 48, 0.45)',
                  boxShadow: isTemplateFocused ? '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(122, 162, 247, 0.1)' : 'none'
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
                {/* Template Header */}
                <div 
                  id={`flat-item-${templateFlatIndex}`}
                  onClick={() => toggleExpand(temp.filename)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '10px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isTemplateFocused ? 'rgba(122, 162, 247, 0.05)' : 'transparent',
                    borderTopLeftRadius: '11px',
                    borderTopRightRadius: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '6px', 
                      background: 'rgba(122, 162, 247, 0.1)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: 'var(--accent-blue)'
                    }}>
                      {isExpanded ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: isTemplateFocused ? 'var(--accent-cyan)' : 'var(--text-main)' }}>{temp.name}</span>
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
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          // @ts-ignore
                          const scriptPath = await window.electronAPI.nativeAction('select-file');
                          if (scriptPath) {
                            const key = `import-script-${temp.filename}`;
                            setLoadingTasks(prev => ({ ...prev, [key]: true }));
                            // @ts-ignore
                            await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "IMPORT_SCRIPT_TO_TEMPLATE:${temp.filename}:${scriptPath}"`);
                            setLoadingTasks(prev => ({ ...prev, [key]: false }));
                            onAction?.();
                          }
                        }}
                        disabled={loadingTasks[`import-script-${temp.filename}`]}
                        style={{ backgroundColor: 'rgba(158, 206, 106, 0.1)', color: 'var(--accent-green)', border: '1px solid rgba(158, 206, 106, 0.2)', width: '24px', height: '24px', padding: 0 }}
                        title="Add Script"
                      >
                        {loadingTasks[`import-script-${temp.filename}`] ? <IconLoader size={12} /> : <IconFilePlus size={14} />}
                      </button>
                      <button 
                        className="btn-hover"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if (window.confirm(`Delete template "${temp.name}"?`)) {
                            const key = `delete-temp-${temp.filename}`;
                            setLoadingTasks(prev => ({ ...prev, [key]: true }));
                            // @ts-ignore
                            await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DELETE_TEMPLATE:${temp.filename}"`);
                            setLoadingTasks(prev => ({ ...prev, [key]: false }));
                            onAction?.();
                          }
                        }}
                        disabled={loadingTasks[`delete-temp-${temp.filename}`]}
                        style={{ backgroundColor: 'rgba(247, 118, 142, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(247, 118, 142, 0.2)', width: '24px', height: '24px', padding: 0 }}
                        title="Delete Template"
                      >
                        {loadingTasks[`delete-temp-${temp.filename}`] ? <IconLoader size={12} /> : <IconTrash size={14} />}
                      </button>
                    </div>

                    <button 
                      className="btn-hover"
                      onClick={(e) => { e.stopPropagation(); handleDeployTemplate(temp.name); }}
                      disabled={loadingTasks[temp.name]}
                      style={{ 
                        background: 'var(--aurora-gradient)', 
                        color: 'var(--accent-cyan)', 
                        border: '1px solid rgba(125, 207, 255, 0.3)', 
                        borderRadius: '6px', 
                        padding: '6px 12px', 
                        fontSize: '11px', 
                        fontWeight: '800', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isTemplateFocused ? '0 0 10px rgba(125, 207, 255, 0.2)' : 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}
                    >
                      {loadingTasks[temp.name] ? <IconLoader size={12} /> : <IconPlay size={12} />} 
                      {loadingTasks[temp.name] ? '...' : 'Deploy'}
                    </button>
                  </div>
                </div>

                {/* Tasks List */}
                {isExpanded && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '6px 10px 10px 10px', 
                    gap: '4px', 
                    background: 'rgba(0, 0, 0, 0.15)',
                    borderBottomLeftRadius: '11px',
                    borderBottomRightRadius: '11px',
                    borderTop: '1px solid var(--border-glass)'
                  }}>
                    {temp.tasks && temp.tasks.length > 0 ? temp.tasks.map((task) => {
                      const taskId = `${temp.filename}-${task.id}`;
                      const taskFlatIndex = flatItems.findIndex(i => i.id === taskId && i.type === 'task');
                      const isTaskFocused = focusedIndex === taskFlatIndex;

                      return (
                        <div 
                          key={taskId} 
                          id={`flat-item-${taskFlatIndex}`}
                          className="interactive-element"
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            backgroundColor: isTaskFocused ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                            padding: '6px 12px', 
                            borderRadius: '6px',
                            transition: 'all 0.15s ease',
                            position: 'relative',
                            overflow: 'hidden'
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
                              boxShadow: '0 0 8px rgba(125, 207, 255, 0.4)',
                            }} />
                          )}
                          <div style={{ color: isTaskFocused ? 'var(--accent-cyan)' : 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '16px' }}>
                            {(task.icons && task.icons.length > 0) || task.icon ? (
                              <ManualIcon icon={task.icons || task.icon} size={16} />
                            ) : (
                              <IconTerminal size={12} />
                            )}
                          </div>
                          <span style={{ fontSize: '12px', color: isTaskFocused ? 'var(--text-main)' : '#a9b1d6', flex: 1, fontWeight: isTaskFocused ? '700' : '500' }}>{task.name}</span>
                          
                          <div style={{ display: 'flex', gap: '6px', opacity: isTaskFocused ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                            <button 
                              className="btn-hover"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const cleanPath = task.script.replace(/^bash\s+['"]?/, '').replace(/['"]?$/, '');
                                // @ts-ignore
                                window.electronAPI.executeCommand(`kwrite "${cleanPath}"`);
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
                                if (window.confirm(`Delete script "${task.name}" from template "${temp.name}"?`)) {
                                  const key = `delete-task-${taskId}`;
                                  setLoadingTasks(prev => ({ ...prev, [key]: true }));
                                  // @ts-ignore
                                  await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DELETE_TEMPLATE_TASK:${temp.filename}:${task.id}"`);
                                  setLoadingTasks(prev => ({ ...prev, [key]: false }));
                                  onAction?.();
                                }
                              }}
                              disabled={loadingTasks[`delete-task-${taskId}`]}
                              style={{ backgroundColor: 'rgba(247, 118, 142, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(247, 118, 142, 0.2)', width: '24px', height: '24px', padding: 0 }}
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
                              style={{ backgroundColor: 'rgba(187, 154, 247, 0.1)', color: 'var(--accent-purple, #bb9af7)', border: '1px solid rgba(187, 154, 247, 0.2)', width: '24px', height: '24px', padding: 0 }}
                              title="Set Icon"
                            >
                              {loadingTasks[`set-icon-${temp.filename}-${task.id}`] ? <IconLoader size={12} /> : <IconRocket size={12} />}
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                const val = window.prompt("Global Shortcut (e.g. Control+Alt+1)", task.shortcut || "");
                                if (val !== null) {
                                  const key = `set-shortcut-${temp.filename}-${task.id}`;
                                  setLoadingTasks(prev => ({ ...prev, [key]: true }));
                                  // @ts-ignore
                                  await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "SET_TEMPLATE_TASK_SHORTCUT:${temp.filename}:${task.id}:${val}"`);
                                  setLoadingTasks(prev => ({ ...prev, [key]: false }));
                                  onAction?.();
                                }
                              }}
                              style={{ 
                                backgroundColor: task.shortcut ? 'rgba(122, 162, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                                color: task.shortcut ? 'var(--accent-blue)' : 'var(--text-dim)', 
                                border: '1px solid rgba(122, 162, 247, 0.2)', 
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
                                backgroundColor: isTaskFocused ? 'rgba(122, 162, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                                color: 'var(--accent-blue)', 
                                border: '1px solid rgba(122, 162, 247, 0.2)', 
                                borderRadius: '4px', 
                                padding: '3px 10px', 
                                fontSize: '10px', 
                                fontWeight: '800',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {loadingTasks[`${temp.name}-${task.id}`] ? <IconLoader size={10} /> : <IconPlay size={10} />} 
                              RUN
                            </button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', padding: '10px', textAlign: 'center' }}>No scripts in this template.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
