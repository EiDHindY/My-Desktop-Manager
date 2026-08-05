import { useEffect } from 'react';

interface KeyboardShortcutDeps {
  activeTabRef: React.MutableRefObject<string>;
  handleSetActiveTab: (tab: string) => void;
  setShowUniversalCreate: (val: boolean) => void;
  setShowCreateDesktopModal: (val: boolean) => void;
  returnDesktopRef: React.MutableRefObject<string | null>;
  currentDesktopRef: React.MutableRefObject<string | null>;
  setLastActionTime: (time: number) => void;
  setCurrentDesktop: (id: string) => void;
  setSearchQuery: (val: string) => void;
  setVisitHistory: React.Dispatch<React.SetStateAction<string[]>>;
  visitHistoryRef: React.MutableRefObject<string[]>;
  setIsPinned: React.Dispatch<React.SetStateAction<boolean>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isModalOpen: boolean;
}

export function useKeyboardShortcuts({
  activeTabRef,
  handleSetActiveTab,
  setShowUniversalCreate,
  setShowCreateDesktopModal,
  returnDesktopRef,
  currentDesktopRef,
  setLastActionTime,
  setCurrentDesktop,
  setSearchQuery,
  setVisitHistory,
  visitHistoryRef,
  setIsPinned,
  searchInputRef,
  isModalOpen
}: KeyboardShortcutDeps) {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return;
      if (e.defaultPrevented) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable;

      // Circular Tab Navigation - ALWAYS allow these even in inputs if Ctrl is held
      if (e.ctrlKey) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const tabs = ['active', 'tasks', 'notes'];
          const currentIndex = tabs.indexOf(activeTabRef.current);
          handleSetActiveTab(currentIndex === -1 ? 'active' : tabs[(currentIndex + 1) % tabs.length]);
          return;
        }
        if (e.key.toLowerCase() === 'q') {
          e.preventDefault();
          const tabs = ['active', 'tasks', 'notes'];
          const currentIndex = tabs.indexOf(activeTabRef.current);
          handleSetActiveTab(currentIndex === -1 ? 'active' : tabs[(currentIndex + tabs.length - 1) % tabs.length]);
          return;
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleSetActiveTab('temps');
          return;
        }
        if (e.key.toLowerCase() === 'n' && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          setShowUniversalCreate(true);
          return;
        }
        if (e.key.toLowerCase() === 'n' && e.altKey) {
          if (activeTabRef.current === 'active') {
            e.preventDefault();
            setShowCreateDesktopModal(true);
            return;
          } else if (activeTabRef.current === 'tasks' || activeTabRef.current === 'notes' || activeTabRef.current === 'temps') {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(`${activeTabRef.current}-create-new`));
            return;
          }
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          const rD = returnDesktopRef.current;
          const cD = currentDesktopRef.current;
          const elToFocus = document.activeElement as HTMLElement;
          if (activeTabRef.current !== 'notes') {
            handleSetActiveTab('active');
          }
          if (rD) {
            setLastActionTime(Date.now());
            const pureId = rD.split("___")[0];
            setCurrentDesktop(pureId);
            setSearchQuery('');
            window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${pureId}"`);
            
            setVisitHistory(prev => {
              if (cD && pureId === cD) return prev;
              return [...prev, cD as string].slice(-50);
            });
            if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }
          }
          return;
        }
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          const elToFocus = document.activeElement as HTMLElement;
          if (activeTabRef.current !== 'notes') {
            handleSetActiveTab('active');
          }
          const currentHist = visitHistoryRef.current;
          if (currentHist.length > 0) {
            const target = currentHist[Math.max(0, currentHist.length - 2)];
            if (target) {
              setLastActionTime(Date.now());
              setCurrentDesktop(target);
              setSearchQuery('');
              window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${target}"`);
            }
          }
          if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }
          return;
        }
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          const elToFocus = document.activeElement as HTMLElement;
          if (activeTabRef.current !== 'notes') {
            handleSetActiveTab('active');
          }
          const currentHist = visitHistoryRef.current;
          if (currentHist.length > 0) {
            const target = currentHist[Math.max(0, currentHist.length - 3)];
            if (target) {
              setLastActionTime(Date.now());
              setCurrentDesktop(target);
              setSearchQuery('');
              window.electronAPI.executeCommand(`qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.current "${target}"`);
            }
          }
          if (activeTabRef.current === 'notes') { setTimeout(() => elToFocus?.focus(), 50); }
          return;
        }
        if (e.key.toLowerCase() === 'z' && e.metaKey) {
          if (window.electronAPI) {
            window.electronAPI.nativeAction('toggle-pin').then(() => setIsPinned(prev => !prev));
          }
          return;
        }
        if (e.shiftKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('toggle-sidebar'));
          return;
        }
      }

      // Clear search on Escape - Allow if in search input or no input
      if (e.key === 'Escape') {
        if (!isInput || document.activeElement === searchInputRef.current) {
          setSearchQuery('')
        }
      }

      // ABSOLUTE GUARD for other keys: if user is typing in any input, ignore
      if (isInput) return;

      // Auto-focus search on any alphanumeric key if not already in an input
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9\/]$/i.test(e.key)) {
        const interceptEvent = new CustomEvent('global-typing-intercept', { detail: { key: e.key }, cancelable: true });
        window.dispatchEvent(interceptEvent);
        if (!interceptEvent.defaultPrevented) {
          searchInputRef.current?.focus()
        }
      }
    }

    const clearSearchHandler = () => setSearchQuery('');
    const focusSearchHandler = () => searchInputRef.current?.focus();
    window.addEventListener('clear-search-query', clearSearchHandler);
    window.addEventListener('focus-global-search', focusSearchHandler);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('clear-search-query', clearSearchHandler);
      window.removeEventListener('focus-global-search', focusSearchHandler);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [
    activeTabRef, handleSetActiveTab, setShowUniversalCreate, setShowCreateDesktopModal,
    returnDesktopRef, currentDesktopRef, setLastActionTime, setCurrentDesktop,
    setSearchQuery, setVisitHistory, visitHistoryRef, setIsPinned, searchInputRef, isModalOpen
  ]);
}
