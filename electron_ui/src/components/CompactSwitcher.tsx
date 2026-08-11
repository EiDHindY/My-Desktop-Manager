import React, { useEffect, useRef } from 'react';
import { IconMonitor } from './Icons';

interface CompactSwitcherProps {
  items: { id: string; name: string; folder: string; icons?: string[]; isPinned?: boolean }[];
  selectedIndex: number;
  currentDesktopId?: string | null;
  onSelect?: (index: number) => void;
  onHover?: (index: number) => void;
}

export default function CompactSwitcher({ items, selectedIndex, currentDesktopId, onSelect, onHover }: CompactSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<{x: number, y: number} | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      const activeElement = containerRef.current.querySelector('.compact-item.active') as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleMouseEnter = (e: React.MouseEvent, index: number, isCurrent: boolean) => {
    if (isCurrent) return;
    
    if (lastMousePos.current) {
      const dx = Math.abs(e.clientX - lastMousePos.current.x);
      const dy = Math.abs(e.clientY - lastMousePos.current.y);
      if (dx <= 2 && dy <= 2) {
        return;
      }
    }
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    onHover?.(index);
  };

  const renderItem = (item: any, index: number, isScrollable: boolean = false) => {
    const isActive = index === selectedIndex;
    const isCurrent = item.id === currentDesktopId;
    const folderText = (item.folder && item.folder !== 'root' && item.folder !== 'Other') ? item.folder : '';

    return (
      <div key={item.id}
        className={`compact-item ${isActive ? 'active' : ''}`}
        onClick={() => !isCurrent && onSelect?.(index)}
        onMouseEnter={(e) => handleMouseEnter(e, index, isCurrent)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: isScrollable ? '10px 12px' : '6px 12px', 
          borderRadius: '8px',
          backgroundColor: isActive ? 'var(--cs-active-bg)' : 'transparent',
          borderLeft: isActive ? '4px solid var(--accent-blue)' : '4px solid transparent',
          transform: isActive ? 'scale(1.02)' : 'scale(1)',
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
            {item.icons.map((icon: string, idx: number) => (
              <img 
                key={idx}
                src={`local-icon://${encodeURIComponent(icon)}`} 
                alt="icon" 
                style={{ width: '18px', height: '18px', objectFit: 'contain', opacity: isActive ? 1 : 0.6 }} 
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', marginRight: '10px' }}>
            <IconMonitor size={14} color={isActive ? 'var(--cs-text-active)' : 'var(--text-dim)'} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ fontSize: '13px', color: isActive ? 'var(--cs-text-active)' : 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {item.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {folderText && (
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.6, whiteSpace: 'nowrap' }}>
                  {folderText}
                </div>
              )}
              {isCurrent && (
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-blue)' }} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const numNonScrollable = items.filter(item => item.id === currentDesktopId || item.isPinned).length;
  const nonScrollableItems = items.slice(0, numNonScrollable);
  const scrollableItems = items.slice(numNonScrollable);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent', // Fully transparent window background
      display: 'flex',
      alignItems: 'center', // Center vertically
      justifyContent: 'center', // Center horizontally
      padding: '16px', // space for shadow
      zIndex: 99999, // Ensure it covers everything
      animation: 'fadeIn 0.15s ease-out',
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
          gap: '2px', 
          width: 'fit-content', 
          minWidth: '300px',
          height: 'fit-content', 
          maxHeight: '100%',
          backgroundColor: 'var(--cs-bg, rgba(46, 52, 64, 0.85))',
          backdropFilter: 'blur(15px)',
          border: '1px solid var(--border-glass)',
          borderRadius: '12px',
          padding: '4px', // Reduced padding here, moved to inner containers
        }}
      >
        {nonScrollableItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '20px', paddingLeft: '4px' }}>
            {nonScrollableItems.map((item, index) => renderItem(item, index, false))}
            <div style={{ height: '1px', backgroundColor: 'var(--border-glass)', margin: '4px 12px', opacity: 0.5 }} />
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '20px', paddingLeft: '4px', paddingTop: '4px', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          {scrollableItems.map((item, index) => renderItem(item, numNonScrollable + index, true))}
        </div>
      </div>
    </div>
  );
}
