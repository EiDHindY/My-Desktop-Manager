import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { createPortal } from 'react-dom';
import { 
  IconMonitor,
  IconZap,
  IconPencil,
  IconKeyboard,
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
  onPrompt: (title: string, defaultVal: string, command: string) => void;
  onShowIconPicker: (id: string) => void;
}

const DesktopItemComponent: React.FC<DesktopItemProps> = ({
  desktopId, pureId, dIndex, query, displayName, isActive, isReturn, winCount, hasWindows,
  isSelected, isHovered, priority, priorityColor, hasScriptAttached, isDeleting,
  icons, shortcut, hasShortcutError, folderName,
  onContextMenu, onSwitch, onHover, onExecuteCommand, onPrompt, onShowIconPicker
}) => {
  let stateClass = "desktop-item ";
  if (isActive) stateClass += "active ";
  if (hasWindows) stateClass += "busy ";
  if (!hasWindows && !isActive && !isReturn) stateClass += "empty ";

  return (
    <Draggable draggableId={desktopId} index={dIndex} key={desktopId} isDragDisabled={!!query}>
      {(providedDesktop, snapshot) => {
        const content = (
          <div 
            ref={providedDesktop.innerRef}
            {...providedDesktop.draggableProps}
            {...providedDesktop.dragHandleProps}
            className={`${stateClass} interactive-element ${isHovered && !snapshot.isDragging ? 'hover-lift' : ''}`}
            onContextMenu={(e) => onContextMenu(e, 'desktop', desktopId, folderName)}
            onClick={() => onSwitch(desktopId)}
            onMouseEnter={() => onHover(desktopId)}
            onMouseLeave={() => onHover(null)}
            style={{ 
              background: snapshot.isDragging ? 'var(--bg-secondary)' : (isActive ? 'var(--aurora-gradient)' : (isSelected ? 'rgba(108, 113, 196, 0.12)' : 'transparent')),
              boxSizing: 'border-box',
              color: isActive ? 'var(--accent-cyan)' : (isReturn ? 'var(--accent-purple)' : (hasWindows ? 'var(--accent-blue)' : 'var(--text-main)')),
              fontWeight: isActive || isReturn || isSelected ? 'bold' : '500',
              transition: snapshot.isDragging ? 'none' : 'all 0.25s ease',
              transform: isActive && !snapshot.isDragging ? 'translateX(2px)' : 'none',
              border: isActive ? '1px solid rgba(42, 161, 152, 0.1)' : (isSelected ? '1px solid rgba(108, 113, 196, 0.4)' : '1px solid transparent'),
              paddingLeft: '24px',
              zIndex: snapshot.isDragging ? 9999 : (isSelected ? 2 : 1),
              boxShadow: snapshot.isDragging ? '0 20px 50px rgba(0,0,0,0.5)' : (isSelected && !isActive ? '0 0 15px rgba(108, 113, 196, 0.15)' : 'none'),
              width: snapshot.isDragging ? (((providedDesktop.draggableProps.style as any)?.width) || '280px') : '100%',
              ...(providedDesktop.draggableProps.style || {})
            }}
          >
            {isActive && <div className="active-pillar" style={{ top: '15%', bottom: '15%' }} />}
            <div style={{ marginRight: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', opacity: isHovered || hasWindows || isActive ? 1 : 0.6, minWidth: '16px', justifyContent: 'center' }}>
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
              color: isHovered && priority !== 'None' ? priorityColor : 'inherit'
            }}>{displayName}</span>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease', flexShrink: 0 }}>
              {hasScriptAttached && (
                <div 
                  className="btn-hover"
                  onClick={(e) => { e.stopPropagation(); onExecuteCommand(`SUMMON:${desktopId}`); }}
                  style={{ 
                    backgroundColor: 'rgba(108, 113, 196, 0.15)', 
                    color: 'var(--accent-purple)', 
                    width: '24px', 
                    height: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(108, 113, 196, 0.3)'
                  }}
                  title="Summon"
                >
                  <IconZap size={14} />
                </div>
              )}
              
              <div 
                className="btn-hover"
                onClick={(e) => { e.stopPropagation(); onPrompt('Rename Desktop', displayName, `RENAME:${desktopId}`); }}
                style={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                  color: 'var(--text-main)', 
                  width: '24px', 
                  height: '24px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                title="Rename"
              >
                <IconPencil size={14} />
              </div>

              <div 
                className="btn-hover"
                onClick={(e) => { e.stopPropagation(); onPrompt('Global Shortcut (e.g. Control+Alt+1)', shortcut || '', `SET_SHORTCUT:${desktopId}`); }}
                style={{ 
                  backgroundColor: shortcut ? 'rgba(38, 139, 210, 0.15)' : 'rgba(255, 255, 255, 0.05)', 
                  color: hasShortcutError ? 'var(--accent-red)' : (shortcut ? 'var(--accent-blue)' : 'var(--text-main)'), 
                  width: '24px', 
                  height: '24px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: hasShortcutError ? '1px solid rgba(220, 50, 47, 0.4)' : (shortcut ? '1px solid rgba(38, 139, 210, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)')
                }}
                title={hasShortcutError ? `FAILED: ${shortcut}` : (shortcut ? `Hotkey: ${shortcut}` : "Set Hotkey")}
              >
                <IconKeyboard size={14} />
              </div>

              {shortcut && (
                <div 
                  className="btn-hover"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onExecuteCommand(`SET_SHORTCUT:${desktopId}:`);
                  }}
                  style={{ 
                    backgroundColor: 'rgba(220, 50, 47, 0.1)', 
                    color: 'var(--accent-red)', 
                    width: '18px', 
                    height: '18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(220, 50, 47, 0.2)',
                    marginLeft: '-4px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    zIndex: 10
                  }}
                  title="Clear Hotkey"
                >
                  ×
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
              {isReturn && !isActive && (
                <div 
                  className="btn-hover"
                  onClick={(e) => { e.stopPropagation(); onExecuteCommand(`GOTO_RETURN:${pureId}`); }}
                  style={{ 
                    backgroundColor: 'rgba(108, 113, 196, 0.1)', 
                    color: 'var(--accent-purple)', 
                    padding: '0 8px', 
                    height: '24px', 
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    border: '1px solid rgba(108, 113, 196, 0.2)',
                    borderRadius: '6px'
                  }}
                  title="Return to this desktop"
                >
                  <IconUndo size={12} />
                  <span>Return</span>
                </div>
              )}
              
              {isSelected && !isActive && (
                <span className="active-badge" style={{ backgroundColor: 'rgba(42, 161, 152, 0.1)', color: 'var(--accent-cyan)' }}>Selected</span>
              )}
              
              {isActive && <span className="active-badge">CURRENT</span>}

              {winCount > 0 && !isActive && (
                <span className="window-badge" style={{ margin: 0 }}>{winCount}w</span>
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
