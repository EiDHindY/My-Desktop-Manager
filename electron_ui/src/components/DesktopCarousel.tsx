import React, { useRef, useEffect } from 'react';

interface DesktopCarouselProps {
  sessionData: any;
  desktopNames: Record<string, string>;
  currentDesktop: string | null;
  onSwitch: (id: string) => void;
}

export default function DesktopCarousel({ sessionData, desktopNames, currentDesktop, onSwitch }: DesktopCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const folders = sessionData?.folders || {};
  
  // Build a flat array of { id, name, folder } for all active desktops
  const items: {id: string, name: string, folder: string}[] = [];
  
  Object.entries(folders).forEach(([folderName, ids]: [string, any]) => {
     if (Array.isArray(ids)) {
       ids.forEach(fullId => {
         const id = fullId.split('___')[0];
         const name = desktopNames[id];
         if (name && (name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop '))) {
           // check if already added (prevent duplicates if session data is messy)
           if (!items.find(i => i.id === id)) {
             items.push({ id, name, folder: folderName });
           }
         }
       });
     }
  });
  
  // Add current if missing (e.g., uncategorized active desktop)
  if (currentDesktop && !items.find(i => i.id === currentDesktop)) {
     const name = desktopNames[currentDesktop];
     if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
       items.push({ id: currentDesktop, name, folder: 'Other' });
     }
  }

  // Handle horizontal scroll with mouse wheel natively
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  // Scroll to active on load or change
  useEffect(() => {
    if (scrollRef.current && currentDesktop) {
      const activeEl = scrollRef.current.querySelector('.carousel-item.active') as HTMLElement;
      if (activeEl) {
         const containerWidth = scrollRef.current.offsetWidth;
         const elLeft = activeEl.offsetLeft;
         const elWidth = activeEl.offsetWidth;
         scrollRef.current.scrollTo({
           left: elLeft - containerWidth / 2 + elWidth / 2,
           behavior: 'smooth'
         });
      }
    }
  }, [currentDesktop, items.length]);

  if (items.length === 0) return null;

  return (
    <div style={{
      width: '100%',
      height: '64px',
      backgroundColor: 'rgba(0, 20, 28, 0.95)',
      borderTop: '1px solid var(--border-glass)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      boxSizing: 'border-box',
      boxShadow: '0 -4px 15px rgba(0,0,0,0.3)',
      zIndex: 100
    }}>
      <div 
        ref={scrollRef}
        onWheel={handleWheel}
        style={{
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          overflowY: 'hidden',
          width: '100%',
          padding: '10px 0',
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
        }}
      >
        <style>{`
          div::-webkit-scrollbar { display: none; }
        `}</style>

        {items.map(item => {
           const isActive = item.id === currentDesktop;
           return (
             <div
               key={item.id}
               className={`carousel-item ${isActive ? 'active' : ''}`}
               onClick={() => onSwitch(item.id)}
               style={{
                 display: 'flex',
                 flexDirection: 'column',
                 justifyContent: 'center',
                 padding: '6px 16px',
                 backgroundColor: isActive ? 'rgba(38, 139, 210, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                 border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-glass)'}`,
                 borderRadius: '10px',
                 cursor: 'pointer',
                 minWidth: 'fit-content',
                 transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                 boxShadow: isActive ? '0 0 12px rgba(38,139,210,0.2)' : 'none',
               }}
               onMouseEnter={(e) => {
                 if (!isActive) {
                   e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                   e.currentTarget.style.transform = 'translateY(-2px)';
                 }
               }}
               onMouseLeave={(e) => {
                 if (!isActive) {
                   e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                   e.currentTarget.style.transform = 'translateY(0)';
                 }
               }}
             >
                <div style={{ fontSize: '10px', color: isActive ? 'var(--accent-blue)' : 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {item.folder}
                </div>
                <div style={{ fontSize: '14px', color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.8)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
             </div>
           );
        })}
      </div>
    </div>
  );
}
