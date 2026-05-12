import { useState, useEffect, useRef, useMemo } from 'react';
import { IconTerminal, IconPlay, IconFolder, IconFolderOpen, IconPencil, IconLoader, IconFilePlus, IconTrash } from './Icons';

interface Task {
  id: string;
  name: string;
  script: string;
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
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto', height: '100%' }}>
      {filteredTemplates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#565f89' }}>
          {query ? 'No matching scripts or templates found' : 'No templates found in ~/.config/desktop-manager/templates'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredTemplates.map(temp => {
            const isExpanded = query ? true : expandedTemps.includes(temp.filename);
            const templateFlatIndex = flatItems.findIndex(i => i.id === temp.filename && i.type === 'template');
            const isTemplateFocused = focusedIndex === templateFlatIndex;

            return (
              <div 
                key={temp.filename}
                style={{
                  borderRadius: '10px',
                  border: isTemplateFocused ? '1px solid #7aa2f7' : '1px solid #3b4261',
                  backgroundColor: isTemplateFocused ? 'rgba(122, 162, 247, 0.1)' : 'transparent',
                  transition: 'all 0.2s ease',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Template Header */}
                <div 
                  id={`flat-item-${templateFlatIndex}`}
                  onClick={() => toggleExpand(temp.filename)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 16px',
                    cursor: 'pointer',
                    backgroundColor: isTemplateFocused ? 'rgba(122, 162, 247, 0.15)' : 'transparent',
                    borderLeft: isTemplateFocused ? '3px solid #7aa2f7' : '3px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#7aa2f7' }}>
                      {isExpanded ? <IconFolderOpen size={20} /> : <IconFolder size={20} />}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 'bold', color: isTemplateFocused ? '#7dcfff' : '#c8d3f5' }}>{temp.name}</span>
                    <span style={{ backgroundColor: 'rgba(122, 162, 247, 0.1)', color: '#7aa2f7', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                      {temp.tasks?.length || 0} Scripts
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
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
                      style={{ backgroundColor: 'transparent', color: '#7aa2f7', border: 'none', padding: '4px', borderRadius: '4px' }}
                      title="Add Script"
                    >
                      {loadingTasks[`import-script-${temp.filename}`] ? <IconLoader size={14} /> : <IconFilePlus size={16} />}
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
                      style={{ backgroundColor: 'transparent', color: '#f7768e', border: 'none', padding: '4px', borderRadius: '4px' }}
                      title="Delete Template"
                    >
                      {loadingTasks[`delete-temp-${temp.filename}`] ? <IconLoader size={14} /> : <IconTrash size={16} />}
                    </button>
                    <button 
                      className="btn-hover"
                      onClick={(e) => { e.stopPropagation(); handleDeployTemplate(temp.name); }}
                      disabled={loadingTasks[temp.name]}
                      style={{ 
                        backgroundColor: '#7aa2f7', 
                        color: '#1a1b26', 
                        border: 'none', 
                        borderRadius: '6px', 
                        padding: '6px 12px', 
                        fontSize: '11px', 
                        fontWeight: 'bold', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isTemplateFocused ? '0 0 10px rgba(122, 162, 247, 0.4)' : 'none'
                      }}
                    >
                      {loadingTasks[temp.name] ? <IconLoader size={14} /> : <IconPlay size={14} />} 
                      {loadingTasks[temp.name] ? 'Deploying...' : 'Deploy All'}
                    </button>
                  </div>
                </div>

                {/* Tasks List */}
                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 8px 12px 8px', gap: '2px' }}>
                    {temp.tasks && temp.tasks.length > 0 ? temp.tasks.map((task) => {
                      const taskId = `${temp.filename}-${task.id}`;
                      const taskFlatIndex = flatItems.findIndex(i => i.id === taskId && i.type === 'task');
                      const isTaskFocused = focusedIndex === taskFlatIndex;

                      return (
                        <div 
                          key={taskId} 
                          id={`flat-item-${taskFlatIndex}`}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            backgroundColor: isTaskFocused ? 'rgba(36, 40, 59, 0.5)' : 'transparent',
                            padding: '8px 12px', 
                            borderRadius: '6px',
                            borderLeft: isTaskFocused ? '3px solid #7dcfff' : '3px solid transparent',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <IconTerminal size={14} color={isTaskFocused ? '#7dcfff' : '#565f89'} />
                          <span style={{ fontSize: '13px', color: isTaskFocused ? '#c8d3f5' : '#a9b1d6', flex: 1 }}>{task.name}</span>
                          
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              className="btn-hover"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const cleanPath = task.script.replace(/^bash\s+['"]?/, '').replace(/['"]?$/, '');
                                // @ts-ignore
                                window.electronAPI.executeCommand(`kwrite "${cleanPath}"`);
                              }}
                              style={{ backgroundColor: 'transparent', color: '#e0af68', border: 'none', padding: '4px' }}
                              title="Edit Script"
                            >
                              <IconPencil size={14} />
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
                              style={{ backgroundColor: 'transparent', color: '#f7768e', border: 'none', padding: '4px' }}
                              title="Delete Script"
                            >
                              {loadingTasks[`delete-task-${taskId}`] ? <IconLoader size={14} /> : <IconTrash size={14} />}
                            </button>
                            <button 
                              className="btn-hover"
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                handleDeployTask(temp.name, task.id);
                              }}
                              disabled={loadingTasks[`${temp.name}-${task.id}`]}
                              style={{ 
                                backgroundColor: isTaskFocused ? 'rgba(122, 162, 247, 0.1)' : 'transparent', 
                                color: '#7aa2f7', 
                                border: '1px solid rgba(122, 162, 247, 0.2)', 
                                borderRadius: '4px', 
                                padding: '4px 10px', 
                                fontSize: '11px', 
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {loadingTasks[`${temp.name}-${task.id}`] ? <IconLoader size={12} /> : <IconPlay size={12} />} 
                              Deploy
                            </button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ fontSize: '12px', color: '#565f89', fontStyle: 'italic', padding: '8px' }}>No scripts in this template.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
