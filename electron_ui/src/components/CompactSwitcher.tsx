import React, { useEffect, useRef } from 'react';

interface CompactSwitcherProps {
  items: { id: string; name: string; folder: string; icons?: string[] }[];
  selectedIndex: number;
  currentDesktopId?: string | null;
  onSelect?: (index: number) => void;
  onHover?: (index: number) => void;
}

export default function CompactSwitcher({ items, selectedIndex, currentDesktopId, onSelect, onHover }: CompactSwitcherProps) {
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
          gap: '0px', // Completely flush
          width: '100%', // Fill the available space
          height: 'fit-content', // Tightly wrap the items!
          maxHeight: '100%',
          overflowY: 'auto',
          backgroundColor: 'var(--cs-bg, rgba(46, 52, 64, 0.85))',
          backdropFilter: 'blur(15px)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '4px 24px 4px 4px', // Extra right padding to prevent clipping when scaled
          scrollbarWidth: 'none'
        }}
      >
        {items.map((item, index) => {
          const isActive = index === selectedIndex;
          const isCurrent = item.id === currentDesktopId;
          const prevFolder = index > 0 ? items[index - 1].folder : null;
          const showFolderHeader = item.folder !== prevFolder && item.folder !== 'root' && item.folder !== 'Other';

          return (
            <React.Fragment key={item.id}>
              {showFolderHeader && (
                <div style={{
                  padding: '4px 12px 0px 12px', // No bottom padding
                  fontSize: '9px',
                  color: 'var(--accent-blue)',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  opacity: 0.9,
                  marginTop: index > 0 ? '4px' : '0',
                  marginBottom: '0px'
                }}>
                  {item.folder}
                </div>
              )}
              <div
                className={`compact-item ${isActive ? 'active' : ''}`}
                onClick={() => !isCurrent && onSelect?.(index)}
                onMouseEnter={() => !isCurrent && onHover?.(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 12px', 
                  paddingLeft: (item.folder !== 'root' && item.folder !== 'Other') ? '24px' : '12px',
                  borderRadius: '8px',
                  backgroundColor: isActive ? 'var(--cs-active-bg)' : 'transparent',
                  borderLeft: isActive ? '4px solid var(--accent-blue)' : '4px solid transparent',
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  transformOrigin: 'left center',
                  transition: 'all 0.15s ease-out',
                  marginTop: '0px',
                  marginBottom: '0px',
                  cursor: isCurrent ? 'default' : 'pointer',
                  zIndex: isActive ? 10 : 1, // Keep scaled item above others
                  opacity: isCurrent ? 0.4 : 1,
                  filter: isCurrent ? 'grayscale(100%)' : 'none'
                }}
              >
                {item.icons && item.icons.length > 0 ? (
                  <div style={{ display: 'flex', gap: '4px', marginRight: '10px' }}>
                    {item.icons.map((icon, idx) => (
                      <img 
                        key={idx}
                        src={`local-icon://${encodeURIComponent(icon)}`} 
                        alt="icon" 
                        style={{ width: '18px', height: '18px', objectFit: 'contain', opacity: isActive ? 1 : 0.6 }} 
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ width: '18px', height: '18px', marginRight: '10px' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '13px', color: isActive ? 'var(--cs-text-active)' : 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    {isCurrent && (
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-blue)' }} />
                    )}
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
