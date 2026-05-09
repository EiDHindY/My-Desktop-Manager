import fs from 'fs';

let content = fs.readFileSync('src/components/LiveTab.tsx', 'utf-8');

// The goal is to define a `renderFolder(folderName, index, isDraggable)` function inside the `LiveTab` component body.
// It will encapsulate the `desktops = folders[folderName] ... return (...)` block.

const renderFolderStart = `
  const renderFolder = (folderName: string, index: number, isDraggable: boolean) => {
    const desktops = folders[folderName] || [];
    
    const matchingDesktops = desktops.filter((id: string) => {
      const pureId = id.split("___")[0];
      const name = desktopNames[pureId] || "";
      return name.toLowerCase().includes(query);
    });

    const folderMatches = folderName.toLowerCase().includes(query);
    const displayDesktops = (query && !folderMatches) ? matchingDesktops : desktops;
    const isExpanded = expandedFolders.includes(folderName) || query;
    
    const folderActive = displayDesktops.filter((id: string) => ((windowCounts || {})[id.split("___")[0]] || 0) > 0).length;
    const folderEmpty = displayDesktops.length - folderActive;
    
    const sortedDesktops = folderName === 'root' 
      ? [...displayDesktops].sort((a, b) => {
          const pureIdA = a.split('___')[0];
          const pureIdB = b.split('___')[0];
          const nameA = (desktopNames[pureIdA] || "").toLowerCase();
          const nameB = (desktopNames[pureIdB] || "").toLowerCase();
          const countA = windowCounts[pureIdA] || 0;
          const countB = windowCounts[pureIdB] || 0;
          
          const isAEmpty = !nameA || nameA === "empty" || nameA.startsWith("desktop ");
          const isBEmpty = !nameB || nameB === "empty" || nameB.startsWith("desktop ");
          
          if (countA > 0 && countB === 0) return -1;
          if (countA === 0 && countB > 0) return 1;
          
          if (!isAEmpty && isBEmpty) return -1;
          if (isAEmpty && !isBEmpty) return 1;
          
          return 0;
        })
      : displayDesktops;

    if (query && !folderMatches && matchingDesktops.length === 0) return null;

    const innerContent = (providedDraggable?: any) => (
      <div 
        ref={providedDraggable?.innerRef} 
        {...providedDraggable?.draggableProps} 
        style={{ marginBottom: '10px', ...(providedDraggable?.draggableProps.style || {}) }}
      >
        <div 
          {...providedDraggable?.dragHandleProps}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folderName)}
          onClick={() => toggleFolder(folderName)}
          onMouseEnter={() => setHoveredFolder(folderName)}
          onMouseLeave={() => setHoveredFolder(null)}
          style={{ 
            display: 'flex', 
            height: '36px', 
            cursor: 'pointer', 
            marginBottom: '2px', 
            padding: '0 12px',
            backgroundColor: visibleItems[selectedIndex]?.id === folderName ? '#3b4261' : '#2a2e42',
            borderRadius: '6px',
            alignItems: 'center',
            color: '#7aa2f7',
            fontWeight: 'bold',
            fontSize: '14px',
            border: visibleItems[selectedIndex]?.id === folderName ? '1px solid #7aa2f7' : (folderName === 'root' ? '1px solid #ff9e64' : '1px solid transparent'),
            transition: 'background-color 0.2s ease, border 0.2s ease'
          }}
        >
          <span style={{ marginRight: '10px', display: 'flex', alignItems: 'center' }}>
            {hoveredFolder === folderName && folderName !== 'root' ? <IconGrip color="#565f89" /> : (isExpanded ? <IconFolderOpen color="#7aa2f7" /> : <IconFolder color="#7aa2f7" />)}
          </span>
          <span style={{ flex: 1, userSelect: 'none' }}>{folderName}</span>
          
          {hoveredFolder === folderName && folderName !== 'root' && (
            <div 
              onClick={(e) => { e.stopPropagation(); setPromptConfig({ title: 'New Folder Name', defaultValue: folderName, command: '' }); }}
              style={{ color: '#bb9af7', marginRight: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#3b4261' }}
            >
              Rename
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#565f89' }}>
            {folderActive > 0 && <span style={{ color: '#ff9e64', marginRight: '5px', fontWeight: 'bold' }}>{folderActive} active</span>}
            {folderActive > 0 && folderEmpty > 0 && <span style={{ color: '#414868', marginRight: '5px' }}>/</span>}
            {folderEmpty > 0 && <span>{folderEmpty} empty</span>}
          </div>
        </div>

        {isExpanded && (
          <Droppable droppableId={folderName} type="DESKTOP" isDropDisabled={!!query}>
            {(providedDroppable) => (
              <div 
                ref={providedDroppable.innerRef} 
                {...providedDroppable.droppableProps}
                style={{ marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '10px' }}
              >
                {sortedDesktops.map((desktopId: string, dIndex: number) => {
                  const pureId = desktopId.split("___")[0];
                  const displayName = desktopNames[pureId] || (pureId.substring(0, 8) + '...');
                  const isActive = pureId === (currentDesktop || '').trim();
                  const isReturn = pureId === (returnDesktop || '').trim();
                  const winCount = windowCounts[pureId] || 0;
                  const isEmpty = winCount === 0 && (!desktopNames[pureId] || desktopNames[pureId].toLowerCase() === "empty");
                  
                  return (
                    <Draggable draggableId={desktopId} index={dIndex} key={desktopId} isDragDisabled={!!query}>
                      {(providedDesktop, snapshot) => (
                        <div 
                          ref={providedDesktop.innerRef}
                          {...providedDesktop.draggableProps}
                          {...providedDesktop.dragHandleProps}
                          onContextMenu={(e) => handleContextMenu(e, 'desktop', desktopId, folderName)}
                          onClick={() => handleSwitchDesktop(desktopId)}
                          style={{ 
                            display: 'flex', 
                            height: '32px', 
                            cursor: 'grab', 
                            marginBottom: '2px',
                            padding: '0 12px',
                            alignItems: 'center',
                            backgroundColor: snapshot.isDragging ? '#1a1b26' : (visibleItems[selectedIndex]?.id === desktopId ? '#3b4261' : (isActive ? 'rgba(255, 158, 100, 0.15)' : (isEmpty ? 'rgba(31, 35, 53, 0.3)' : '#1f2335'))),
                            border: visibleItems[selectedIndex]?.id === desktopId ? '1px solid #7aa2f7' : (isActive ? '1px solid #ff9e64' : (isReturn ? '1px solid #bb9af7' : '1px solid #3b4261')),
                            borderRadius: '6px',
                            boxSizing: 'border-box',
                            opacity: isEmpty && !snapshot.isDragging ? 0.6 : 1,
                            color: isActive ? '#ff9e64' : (isReturn ? '#bb9af7' : '#c8d3f5'),
                            fontSize: '13px',
                            fontWeight: isActive || isReturn || visibleItems[selectedIndex]?.id === desktopId ? 'bold' : 'normal',
                            transition: snapshot.isDragging ? 'none' : 'background-color 0.2s ease, border 0.2s ease',
                            boxShadow: snapshot.isDragging ? '0 10px 20px rgba(0,0,0,0.5)' : (visibleItems[selectedIndex]?.id === desktopId ? '0 0 10px rgba(122, 162, 247, 0.3)' : (isActive ? '0 0 10px rgba(255, 158, 100, 0.2)' : 'none')),
                            ...(providedDesktop.draggableProps.style || {})
                          }}
                        >
                          <span style={{ marginRight: '10px', color: isActive ? '#ff9e64' : (isReturn ? '#bb9af7' : (isEmpty ? '#414868' : '#565f89')), flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <IconMonitor size={14} color="currentColor" />
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                            {winCount > 0 && <span style={{ marginLeft: '8px', color: '#bb9af7', fontSize: '11px', opacity: 0.8 }}>({winCount} windows)</span>}
                          </span>
                          
                          {isReturn && !isActive && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#bb9af7', marginRight: '8px' }}>
                              <IconUndo size={12} /> Return
                            </span>
                          )}

                          {isActive && <span style={{ fontSize: '10px', backgroundColor: '#ff9e64', color: '#1a1b26', padding: '1px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Current</span>}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {providedDroppable.placeholder}
                {desktops.length === 0 && !query && (
                  <div style={{ padding: '4px 10px', color: '#565f89', fontSize: '12px', fontStyle: 'italic' }}>
                    Empty folder
                  </div>
                )}
              </div>
            )}
          </Droppable>
        )}
      </div>
    );

    if (!isDraggable) {
      return <div key={folderName}>{innerContent()}</div>;
    }

    return (
      <Draggable draggableId={folderName} index={index} key={folderName} isDragDisabled={!!query}>
        {(provided) => innerContent(provided)}
      </Draggable>
    );
  };
`;

const renderBlock = `
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ padding: '10px' }}>
        <Droppable droppableId="board" type="FOLDER">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {folderNames.filter(f => f !== 'root').map((folderName, index) => renderFolder(folderName, index, true))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        {/* Render Root statically below the droppable */}
        {folders['root'] && renderFolder('root', 999, false)}
      </div>
`;

// Now we need to replace everything from `return (` up to `{contextMenu && (` with `renderBlock`.
// And inject `renderFolderStart` before `return (`

const returnIndex = content.indexOf('return (');
const contextMenuIndex = content.indexOf('{contextMenu && (');

if (returnIndex !== -1 && contextMenuIndex !== -1) {
  const newContent = content.substring(0, returnIndex) + renderFolderStart + renderBlock + '\n      ' + content.substring(contextMenuIndex);
  fs.writeFileSync('src/components/LiveTab.tsx', newContent, 'utf-8');
  console.log("Successfully rewrote LiveTab.tsx!");
} else {
  console.log("Failed to find boundaries");
}
