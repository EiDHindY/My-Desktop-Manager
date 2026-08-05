import { useState, useRef, useEffect, useCallback } from 'react';

export function useVisitHistory() {
  const [currentDesktop, setCurrentDesktop] = useState<string | null>(null);
  const currentDesktopRef = useRef<string | null>(null);
  useEffect(() => { currentDesktopRef.current = currentDesktop; }, [currentDesktop]);
  
  const [returnDesktop, setReturnDesktop] = useState<string | null>(null);
  const returnDesktopRef = useRef<string | null>(null);
  useEffect(() => { returnDesktopRef.current = returnDesktop; }, [returnDesktop]);
  
  const [visitHistory, setVisitHistory] = useState<string[]>([]);
  const visitHistoryRef = useRef<string[]>([]);
  useEffect(() => { visitHistoryRef.current = visitHistory; }, [visitHistory]);
  
  const prevDesktopRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentDesktop) {
      if (prevDesktopRef.current && prevDesktopRef.current !== currentDesktop) {
        const prev = prevDesktopRef.current;
        setVisitHistory(oldHist => {
          const newHist = oldHist.filter(id => id !== prev && id !== currentDesktop);
          newHist.push(prev);
          window.electronAPI.writeJSON('history.json', { last_uuid: prev, history: newHist });
          setReturnDesktop(prev);
          return newHist;
        });
      }
      prevDesktopRef.current = currentDesktop;
    }
  }, [currentDesktop]);

  return {
    currentDesktop,
    setCurrentDesktop,
    currentDesktopRef,
    returnDesktop,
    setReturnDesktop,
    returnDesktopRef,
    visitHistory,
    setVisitHistory,
    visitHistoryRef,
    prevDesktopRef,
  };
}
