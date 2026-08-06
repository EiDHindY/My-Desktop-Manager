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
      const [sessionData, desktopInfo, historyData] = await Promise.all([
        window.electronAPI.readJSON('session.json'),
        window.electronAPI.fetchDesktops(true), // scan windows to get counts
        window.electronAPI.readJSON('history.json')
      ]);

      const folders = sessionData?.folders || {};
      const creationTimes = sessionData?.creation_times || {};
      const visitHistory = historyData?.history || [];
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
             const count = desktopInfo.counts ? desktopInfo.counts[id] || 0 : 0;
             const isRecentlyCreated = creationTimes[id] && (Date.now() - creationTimes[id] < 30 * 1000);

             if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
               if (count > 0 || isRecentlyCreated || id === currentDesktop) {
                 if (!newItems.find(i => i.id === id)) {
                   newItems.push({ id, name, folder: folderName, icons: dIcons[id] });
                 }
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

      newItems.sort((a, b) => {
        if (a.id === currentDesktop) return -1;
        if (b.id === currentDesktop) return 1;

        const idxA = visitHistory.indexOf(a.id);
        const idxB = visitHistory.indexOf(b.id);
        
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        
        return a.name.localeCompare(b.name);
      });
      
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
    
    if (window.electronAPI.onCompactShow) {
      window.electronAPI.onCompactShow((payload: any) => {
        setMousePos({ x: payload.localX, y: payload.localY });
        if (payload.direction) {
          const length = itemsRef.current.length;
          if (length <= 1) return;
          const step = payload.direction > 0 ? -1 : 1;
          let next = step === 1 ? 1 : length - 1;
          indexRef.current = next;
          setSelectedIndex(next);
        }
      });
    }

    if (window.electronAPI.onCompactScroll) {
      window.electronAPI.onCompactScroll((direction) => {
        const length = itemsRef.current.length;
        if (length <= 1) return;

        let next = indexRef.current;
        const step = direction > 0 ? -1 : 1;
        
        if (next === -1) {
          next = step === 1 ? 1 : length - 1;
        } else {
          next += step;
          if (next < 1) next = length - 1;
          if (next >= length) next = 1;
        }
        
        indexRef.current = next;
        setSelectedIndex(next);
      });
    }

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
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
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
