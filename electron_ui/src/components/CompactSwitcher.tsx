import React, { useEffect, useRef } from 'react';

interface CompactSwitcherProps {
  items: { id: string; name: string; folder: string; icons?: string[] }[];
  selectedIndex: number;
  onSelect?: (index: number) => void;
  onHover?: (index: number) => void;
}

export default function CompactSwitcher({ items, selectedIndex, onSelect, onHover }: CompactSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the selected item into view
  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector('.compact-item.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent', // Fully transparent window background
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999, // Ensure it covers everything
      animation: 'fadeIn 0.15s ease-out',
      padding: '16px' // space for shadow
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .compact-switcher-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div 
        ref={containerRef}
        className="compact-switcher-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px', // Tighter gap
          width: '100%', // Fill the available space
          height: 'fit-content', // Tightly wrap the items!
          maxHeight: '100%',
          overflowY: 'auto',
          backgroundColor: 'rgba(0, 20, 28, 0.85)', // Restore glass box
          backdropFilter: 'blur(15px)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '4px', // Tighter padding
          scrollbarWidth: 'none'
        }}
      >
        {items.map((item, index) => {
          const isActive = index === selectedIndex;
          const prevFolder = index > 0 ? items[index - 1].folder : null;
          const showFolderHeader = item.folder !== prevFolder;

          return (
            <React.Fragment key={item.id}>
              {showFolderHeader && (
                <div style={{
                  padding: '12px 12px 4px 12px',
                  fontSize: '10px',
                  color: 'var(--accent-blue)',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  opacity: 0.8
                }}>
                  {item.folder}
                </div>
              )}
              <div
                className={`compact-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelect?.(index)}
                onMouseEnter={() => onHover?.(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px', 
                  paddingLeft: '24px', // Indented for sub-items
                  borderRadius: '8px',
                  backgroundColor: isActive ? 'rgba(38, 139, 210, 0.2)' : 'transparent',
                  borderLeft: isActive ? '4px solid var(--accent-blue)' : '4px solid transparent',
                  transition: 'all 0.1s ease',
                  marginTop: '2px',
                  marginBottom: '2px',
                  cursor: 'pointer'
                }}
              >
                {item.icons && item.icons.length > 0 ? (
                  <div style={{ display: 'flex', gap: '4px', marginRight: '12px' }}>
                    {item.icons.map((icon, idx) => (
                      <img 
                        key={idx}
                        src={`local-icon://${encodeURIComponent(icon)}`} 
                        alt="icon" 
                        style={{ width: '20px', height: '20px', objectFit: 'contain', opacity: isActive ? 1 : 0.6 }} 
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ width: '20px', height: '20px', marginRight: '12px' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.8)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
