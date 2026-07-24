import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { createPortal } from 'react-dom';
import { 
  IconMonitor,
  IconZap,
  IconTrash,
  IconUndo,
  IconLoader,
  ManualIcon
} from './Icons';

interface DesktopItemProps {
  desktopId: string;
  pureId: string;
  dIndex: number;
  query: string;
  displayName: string;
  isActive: boolean;
  isReturn: boolean;
  historyShortcut?: string | null;
  winCount: number;
  hasWindows: boolean;
  isSelected: boolean;
  isHovered: boolean;
  priority: string;
  priorityColor: string;
  hasScriptAttached: boolean;
  isDeleting: boolean;
  icons: string[];
  shortcut: string | null;
  hasShortcutError: boolean;
  folderName: string;
  
  onContextMenu: (e: React.MouseEvent, type: 'desktop', id: string, folderName?: string) => void;
  onSwitch: (id: string) => void;
  onHover: (id: string | null) => void;
  onExecuteCommand: (cmd: string) => void;
  onPrompt: (title: string, defaultVal: string, command: string, isConfirm?: boolean) => void;
  onShowIconPicker: (id: string) => void;
  hideActionButtons?: boolean;
}

const DesktopItemComponent: React.FC<DesktopItemProps> = ({
  desktopId, pureId, dIndex, query, displayName, isActive, isReturn, historyShortcut, winCount, hasWindows,
  isSelected, isHovered, priority, priorityColor, hasScriptAttached, isDeleting,
  icons, shortcut, hasShortcutError, folderName,
  onContextMenu, onSwitch, onHover, onExecuteCommand, onPrompt, onShowIconPicker, hideActionButtons
}) => {
  let stateClass = "desktop-item ";
  if (isActive) stateClass += "active ";
  if (hasWindows) stateClass += "busy ";
  if (!hasWindows && !isActive && !isReturn) stateClass += "empty ";
  const isFocused = isSelected;
  if (!isActive && !isFocused) stateClass += "dimmed-desktop ";
  if (isFocused) stateClass += "nav-focus-item ";

  return (
    <Draggable draggableId={desktopId} index={dIndex} key={desktopId} isDragDisabled={!!query}>
      {(providedDesktop, snapshot) => {
        const content = (
          <div 
            ref={providedDesktop.innerRef}
            {...providedDesktop.draggableProps}
            {...providedDesktop.dragHandleProps}
            className={stateClass}
            onContextMenu={(e) => onContextMenu(e, 'desktop', desktopId, folderName)}
            onClick={() => onSwitch(desktopId)}
            onMouseEnter={() => onHover(desktopId)}
            onMouseLeave={() => onHover(null)}
            style={{ 
              background: snapshot.isDragging ? 'var(--bg-secondary)' : (isActive ? 'linear-gradient(90deg, rgba(38, 139, 210, 0.25) 0%, rgba(38, 139, 210, 0.05) 100%)' : 'transparent'),
              boxSizing: 'border-box',
              color: isActive ? 'var(--accent-cyan)' : (isReturn ? 'var(--accent-purple)' : (hasWindows ? 'var(--accent-blue)' : 'var(--text-main)')),
              fontWeight: isActive || isReturn || isSelected ? 'bold' : '500',
              transition: snapshot.isDragging ? 'none' : 'all 0.25s ease',
              transform: isActive && !snapshot.isDragging ? 'translateX(2px)' : 'none',
              border: isActive ? '1px solid rgba(38, 139, 210, 0.3)' : '1px solid transparent',
              paddingLeft: '12px',
              zIndex: snapshot.isDragging ? 9999 : (isActive ? 3 : 1),
              boxShadow: snapshot.isDragging ? '0 20px 50px rgba(0,0,0,0.5)' : (isActive ? '0 4px 12px rgba(38, 139, 210, 0.2)' : 'none'),
              width: snapshot.isDragging ? (((providedDesktop.draggableProps.style as any)?.width) || '280px') : '100%',
              ...(providedDesktop.draggableProps.style || {})
            }}
          >
            {isActive && <div className="active-pillar" style={{ top: '15%', bottom: '15%', boxShadow: '0 0 10px var(--aurora-pillar)' }} />}
            
            <div style={{ width: '32px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginRight: '8px' }}>
              {winCount > 0 && (
                <span className="window-badge" style={{ margin: 0 }}>{winCount}w</span>
              )}
            </div>

            <div style={{ marginRight: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', opacity: isFocused || hasWindows || isActive ? 1 : 0.6, minWidth: '16px', justifyContent: 'center' }}>
              {isDeleting ? (
                <IconLoader size={14} color="var(--accent-red)" />
              ) : (icons && icons.length > 0) ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {icons.map((ic, i) => (
                    <ManualIcon key={i} icon={ic} size={16} />
                  ))}
                </div>
              ) : (
                <IconMonitor size={14} color={isActive ? 'var(--accent-cyan)' : (isReturn ? 'var(--accent-purple)' : (hasWindows ? 'var(--accent-blue)' : 'var(--text-dim)'))} />
              )}
            </div>
            {priority !== 'None' && priority?.toUpperCase() !== 'ANCHOR' && (
              <div style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: priorityColor, 
                marginRight: '10px',
                boxShadow: `0 0 10px ${priorityColor}88`,
                flexShrink: 0
              }} />
            )}
            <span style={{ 
              flex: 1, 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              color: isFocused && priority !== 'None' ? priorityColor : 'inherit'
            }}>{displayName}</span>
            
            {!hideActionButtons && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: isFocused ? 1 : 0, transition: 'opacity 0.2s ease', flexShrink: 0 }}>
                <div 
                  className="btn-hover"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onPrompt('Are you sure you want to delete desktop?', '', `CLEAR:${desktopId}`, true); 
                  }}
                  style={{ 
                    backgroundColor: 'rgba(220, 50, 47, 0.1)', 
                    color: 'var(--accent-red)', 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(220, 50, 47, 0.2)'
                  }}
                  title="Delete"
                >
                  <IconTrash size={14} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
              {historyShortcut && !isActive && (
                <div 
                  className="btn-hover"
                  onClick={(e) => { e.stopPropagation(); onSwitch(pureId); }}
                  style={{ 
                    backgroundColor: 'rgba(108, 113, 196, 0.1)', 
                    color: 'var(--accent-purple)', 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(108, 113, 196, 0.2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace'
                  }}
                  title={`Switch to this desktop (Ctrl+${historyShortcut})`}
                >
                  {historyShortcut}
                </div>
              )}
            </div>
          </div>
        );

        if (snapshot.isDragging) {
          return createPortal(content, document.body);
        }
        return content;
      }}
    </Draggable>
  );
};

export default React.memo(DesktopItemComponent, (prevProps, nextProps) => {
  return prevProps.desktopId === nextProps.desktopId &&
         prevProps.displayName === nextProps.displayName &&
         prevProps.isActive === nextProps.isActive &&
         prevProps.isReturn === nextProps.isReturn &&
         prevProps.historyShortcut === nextProps.historyShortcut &&
         prevProps.winCount === nextProps.winCount &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.isHovered === nextProps.isHovered &&
         prevProps.priority === nextProps.priority &&
         prevProps.hasScriptAttached === nextProps.hasScriptAttached &&
         prevProps.isDeleting === nextProps.isDeleting &&
         prevProps.icons.join(',') === nextProps.icons.join(',') &&
         prevProps.shortcut === nextProps.shortcut &&
         prevProps.hasShortcutError === nextProps.hasShortcutError &&
         prevProps.query === nextProps.query &&
         prevProps.dIndex === nextProps.dIndex;
});
