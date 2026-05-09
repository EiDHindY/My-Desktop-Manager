import { useState } from 'react';
import { IconTerminal, IconPlay, IconFolder, IconFolderOpen, IconPencil, IconTrash, IconLoader, IconFilePlus } from './Icons';

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

export default function TempsTab({ templates, searchQuery }: { templates: Template[], searchQuery?: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [expandedTemps, setExpandedTemps] = useState<string[]>([]); // collapsed by default
  const [loadingTasks, setLoadingTasks] = useState<Record<string, boolean>>({});

  const toggleExpand = (filename: string) => {
    if (expandedTemps.includes(filename)) {
      setExpandedTemps(expandedTemps.filter(f => f !== filename));
    } else {
      setExpandedTemps([...expandedTemps, filename]);
    }
  };

  const handleDeploy = async (templateName: string) => {
    setLoadingTasks(prev => ({ ...prev, [templateName]: true }));
    // @ts-ignore
    await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DEPLOY_ALL:${templateName}"`);
    setLoadingTasks(prev => ({ ...prev, [templateName]: false }));
  };

  const query = (searchQuery || '').toLowerCase().trim();
  
  const filteredTemplates = templates.map(temp => {
    if (!query) return temp;
    
    // Check if template name matches
    const nameMatch = temp.name.toLowerCase().includes(query);
    
    // Filter tasks that match
    const matchingTasks = temp.tasks?.filter(t => t.name.toLowerCase().includes(query)) || [];
    
    if (nameMatch || matchingTasks.length > 0) {
      // If template name matches, show all tasks. Otherwise show only matching tasks.
      return { ...temp, tasks: nameMatch ? temp.tasks : matchingTasks };
    }
    
    return null;
  }).filter(Boolean) as Template[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', overflowY: 'auto', height: '100%' }}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredTemplates.map(temp => {
          // Auto-expand if there's a search query, otherwise use standard state
          const isExpanded = query ? true : expandedTemps.includes(temp.filename);
          return (
            <div 
              key={temp.filename}
              onMouseEnter={() => setHovered(temp.filename)}
              onMouseLeave={() => setHovered(null)}
              style={{
                backgroundColor: hovered === temp.filename ? '#292e42' : '#1f2335',
                border: hovered === temp.filename ? '1px solid #7aa2f7' : '1px solid #3b4261',
                borderRadius: '8px',
                padding: '16px',
                transition: 'all 0.2s ease',
                boxShadow: hovered === temp.filename ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              <div 
                onClick={() => toggleExpand(temp.filename)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', color: '#7aa2f7' }}>
                    {isExpanded ? <IconFolderOpen size={24} /> : <IconFolder size={24} />}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#c8d3f5' }}>{temp.name}</span>
                  <span style={{ backgroundColor: '#3b4261', color: '#7aa2f7', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                    {temp.tasks?.length || 0} Scripts
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', opacity: hovered === temp.filename ? 1 : 0.5, transition: 'opacity 0.2s ease' }}>
                  {hovered === temp.filename && (
                    <>
                      <button 
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
                          }
                        }}
                        disabled={loadingTasks[`import-script-${temp.filename}`]}
                        style={{ 
                          backgroundColor: 'transparent', 
                          color: loadingTasks[`import-script-${temp.filename}`] ? '#565f89' : '#7aa2f7', 
                          border: '1px solid rgba(122, 162, 247, 0.3)', 
                          borderRadius: '6px', 
                          padding: '6px 8px', 
                          cursor: loadingTasks[`import-script-${temp.filename}`] ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.2s ease'
                        }}
                        title="Add Script to Template"
                        onMouseEnter={(e) => { if (!loadingTasks[`import-script-${temp.filename}`]) e.currentTarget.style.backgroundColor = 'rgba(122, 162, 247, 0.15)'; }}
                        onMouseLeave={(e) => { if (!loadingTasks[`import-script-${temp.filename}`]) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {loadingTasks[`import-script-${temp.filename}`] ? <IconLoader size={14} /> : <IconFilePlus size={14} />}
                      </button>
                      <button 
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if (window.confirm(`Delete template '${temp.name}'?`)) {
                            const key = `delete-${temp.filename}`;
                            setLoadingTasks(prev => ({ ...prev, [key]: true }));
                            // @ts-ignore
                            await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DELETE_TEMPLATE:${temp.filename}"`);
                            setLoadingTasks(prev => ({ ...prev, [key]: false }));
                          }
                        }}
                        disabled={loadingTasks[`delete-${temp.filename}`]}
                        style={{ 
                          backgroundColor: 'transparent', 
                          color: loadingTasks[`delete-${temp.filename}`] ? '#565f89' : '#f7768e', 
                          border: '1px solid rgba(247, 118, 142, 0.3)', 
                          borderRadius: '6px', 
                          padding: '6px 8px', 
                          cursor: loadingTasks[`delete-${temp.filename}`] ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.2s ease'
                        }}
                        title="Delete Template"
                        onMouseEnter={(e) => { if (!loadingTasks[`delete-${temp.filename}`]) e.currentTarget.style.backgroundColor = 'rgba(247, 118, 142, 0.15)'; }}
                        onMouseLeave={(e) => { if (!loadingTasks[`delete-${temp.filename}`]) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {loadingTasks[`delete-${temp.filename}`] ? <IconLoader size={14} /> : <IconTrash size={14} />}
                      </button>
                    </>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeploy(temp.name); }}
                    disabled={loadingTasks[temp.name]}
                    style={{ 
                      backgroundColor: '#7aa2f7', 
                      color: '#1a1b26', 
                      border: 'none', 
                      borderRadius: '6px', 
                      padding: '6px 12px', 
                      fontSize: '12px', 
                      fontWeight: 'bold', 
                      cursor: loadingTasks[temp.name] ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: loadingTasks[temp.name] ? 0.7 : 1
                    }}
                  >
                    {loadingTasks[temp.name] ? <IconLoader size={14} /> : <IconPlay size={14} />} 
                    {loadingTasks[temp.name] ? 'Deploying...' : 'Deploy All'}
                  </button>
                </div>
            </div>

            {isExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {temp.tasks && temp.tasks.length > 0 ? temp.tasks.map((task, idx) => {
                  const taskKey = `${temp.name}-${task.id || idx}`;
                  return (
                  <div 
                    key={taskKey} 
                    onMouseEnter={() => setHoveredTask(taskKey)}
                    onMouseLeave={() => setHoveredTask(null)}
                    style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    backgroundColor: '#16161e', 
                    padding: '8px 12px', 
                    borderRadius: '6px',
                    border: '1px solid #292e42'
                  }}>
                    <IconTerminal size={14} color="#565f89" />
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                      <span style={{ fontSize: '13px', color: '#a9b1d6', fontWeight: '500' }}>{task.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {hoveredTask === taskKey && (
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            const cleanPath = task.script.replace(/^bash\s+['"]?/, '').replace(/['"]?$/, '');
                            // @ts-ignore
                            window.electronAPI.executeCommand(`kwrite "${cleanPath}"`);
                          }}
                          style={{ 
                            backgroundColor: 'transparent', 
                            color: '#e0af68', 
                            border: '1px solid #414868', 
                            borderRadius: '4px', 
                            padding: '4px 8px', 
                            fontSize: '11px', 
                            fontWeight: 'bold', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease',
                            animation: 'fadeIn 0.2s ease'
                          }}
                          title="Edit Script"
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#414868'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <IconPencil size={12} />
                        </button>
                      )}
                      {hoveredTask === taskKey && (
                        <button 
                          onClick={async (e) => { 
                            e.stopPropagation(); 
                            if (window.confirm(`Delete script '${task.name}' from template?`)) {
                              const key = `delete-task-${task.id}`;
                              setLoadingTasks(prev => ({ ...prev, [key]: true }));
                              // @ts-ignore
                              await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DELETE_TEMPLATE_TASK:${temp.filename}:${task.id}"`);
                              setLoadingTasks(prev => ({ ...prev, [key]: false }));
                            }
                          }}
                          disabled={loadingTasks[`delete-task-${task.id}`]}
                          style={{ 
                            backgroundColor: 'transparent', 
                            color: loadingTasks[`delete-task-${task.id}`] ? '#565f89' : '#f7768e', 
                            border: '1px solid rgba(247, 118, 142, 0.3)', 
                            borderRadius: '4px', 
                            padding: '4px 6px', 
                            cursor: loadingTasks[`delete-task-${task.id}`] ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s ease',
                            animation: 'fadeIn 0.2s ease'
                          }}
                          title="Delete Script"
                          onMouseEnter={(e) => { if (!loadingTasks[`delete-task-${task.id}`]) e.currentTarget.style.backgroundColor = 'rgba(247, 118, 142, 0.1)'; }}
                          onMouseLeave={(e) => { if (!loadingTasks[`delete-task-${task.id}`]) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {loadingTasks[`delete-task-${task.id}`] ? <IconLoader size={12} /> : <IconTrash size={12} />}
                        </button>
                      )}
                      <button 
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          const key = `${temp.name}-${task.id}`;
                          setLoadingTasks(prev => ({ ...prev, [key]: true }));
                          // @ts-ignore
                          await window.electronAPI.executeCommand(`npx tsx "/home/dod/projects/Desktop Manager/shared_backend/cli.ts" "DEPLOY_TASK:${temp.name}:${task.id}"`);
                          setLoadingTasks(prev => ({ ...prev, [key]: false }));
                        }}
                        disabled={loadingTasks[`${temp.name}-${task.id}`]}
                        style={{ 
                          backgroundColor: 'transparent', 
                          color: loadingTasks[`${temp.name}-${task.id}`] ? '#565f89' : '#7aa2f7', 
                          border: '1px solid #3b4261', 
                          borderRadius: '4px', 
                          padding: '4px 8px', 
                          fontSize: '11px', 
                          fontWeight: 'bold', 
                          cursor: loadingTasks[`${temp.name}-${task.id}`] ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { if (!loadingTasks[`${temp.name}-${task.id}`]) { e.currentTarget.style.backgroundColor = '#1f2335'; e.currentTarget.style.borderColor = '#7aa2f7'; } }}
                        onMouseLeave={(e) => { if (!loadingTasks[`${temp.name}-${task.id}`]) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#3b4261'; } }}
                      >
                        {loadingTasks[`${temp.name}-${task.id}`] ? <IconLoader size={12} /> : <IconPlay size={12} />} 
                        {loadingTasks[`${temp.name}-${task.id}`] ? 'Deploying...' : 'Deploy'}
                      </button>
                    </div>
                  </div>
                )}) : (
                  <div style={{ fontSize: '12px', color: '#565f89', fontStyle: 'italic' }}>No scripts in this template.</div>
                )}
              </div>
            )}

          </div>
        )})}
      </div>

      {filteredTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#565f89' }}>
          {query ? 'No matching scripts or templates found' : 'No templates found in ~/.config/desktop-manager/templates'}
        </div>
      )}
    </div>
  );
}
