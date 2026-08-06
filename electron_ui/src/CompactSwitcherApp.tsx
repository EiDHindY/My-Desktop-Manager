import React, { useEffect, useState, useRef } from 'react';
import CompactSwitcher from './components/CompactSwitcher';
import './App.css'; // ensure CSS variables are loaded

export default function CompactSwitcherApp() {
  const [items, setItems] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [currentDesktopId, setCurrentDesktopId] = useState<string | null>(null);
  const currentDesktopIdRef = useRef<string | null>(null);
  
  const itemsRef = useRef<any[]>([]);
  const indexRef = useRef(-1);
  
  const loadData = async () => {
    if (!window.electronAPI) return;
    try {
      const [sessionData, desktopInfo] = await Promise.all([
        window.electronAPI.readJSON('session.json'),
        window.electronAPI.fetchDesktops(false) // no window scan needed
      ]);

      const folders = sessionData?.folders || {};
      const dNames = desktopInfo?.names || {};
      const dIcons = desktopInfo?.icons || {};
      const currentDesktop = desktopInfo?.current;
      
      const newItems: any[] = [];
      const folderOrder = sessionData?.folder_order || [];
      const sortedFolders = Object.keys(folders).sort((a, b) => {
        if (a === 'root') return 1;
        if (b === 'root') return -1;
        const idxA = folderOrder.includes(a) ? folderOrder.indexOf(a) : 999;
        const idxB = folderOrder.includes(b) ? folderOrder.indexOf(b) : 999;
        if (idxA === idxB) return a.localeCompare(b);
        return idxA - idxB;
      });

      sortedFolders.forEach((folderName) => {
         const ids = folders[folderName];
         if (Array.isArray(ids)) {
           ids.forEach(fullId => {
             const id = fullId.split('___')[0];
             const name = dNames[id];
             if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
               if (!newItems.find(i => i.id === id)) {
                 newItems.push({ id, name, folder: folderName, icons: dIcons[id] });
               }
             }
           });
         }
      });
      
      if (currentDesktop && !newItems.find(i => i.id === currentDesktop)) {
         const name = dNames[currentDesktop];
         if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
           newItems.push({ id: currentDesktop, name, folder: 'Other', icons: dIcons[currentDesktop] });
         }
      }
      
      itemsRef.current = newItems;
      setItems(newItems);
      setCurrentDesktopId(currentDesktop || null);
      currentDesktopIdRef.current = currentDesktop || null;
    } catch (e) {
      console.error("Failed to load desktops for switcher:", e);
    }
  };

  useEffect(() => {
    loadData();
    if (window.electronAPI?.onDesktopsUpdated) {
      window.electronAPI.onDesktopsUpdated(() => {
        loadData();
      });
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    
    window.electronAPI.onCompactScroll((direction) => {
      let next = indexRef.current;
      const step = direction > 0 ? -1 : 1;
      
      // Find the next valid index (skip currentDesktopId)
      for (let i = next + step; i >= 0 && i < itemsRef.current.length; i += step) {
        if (itemsRef.current[i].id !== currentDesktopIdRef.current) {
          next = i;
          break;
        }
      }
      
      if (itemsRef.current.length === 0) next = 0;
      
      indexRef.current = next;
      setSelectedIndex(next);
    });

    window.electronAPI.onCompactConfirm(() => {
      const selected = itemsRef.current[indexRef.current];
      if (selected && window.electronAPI) {
        window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${selected.id}"`);
      }
    });

    if (window.electronAPI.onCompactReset) {
      window.electronAPI.onCompactReset(() => {
        indexRef.current = -1;
        setSelectedIndex(-1);
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.electronAPI) {
        window.electronAPI.hideCompactSwitcher();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', padding: '16px' }}>
      <CompactSwitcher 
        items={items} 
        selectedIndex={selectedIndex}
        currentDesktopId={currentDesktopId}
        onSelect={(idx) => {
          const selected = itemsRef.current[idx];
          setSelectedIndex(idx);
          if (selected && window.electronAPI) {
            window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${selected.id}"`);
            window.electronAPI.hideCompactSwitcher();
          }
        }}
        onHover={(idx) => {
          indexRef.current = idx;
          setSelectedIndex(idx);
        }}
      />
    </div>
  );
}
