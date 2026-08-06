const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const importStr = `import CompactSwitcher from './components/CompactSwitcher'\n`;
content = content.replace("import PromptModal from './components/PromptModal'", importStr + "import PromptModal from './components/PromptModal'");

const stateStr = `
  const [isCompactSwitcherActive, setIsCompactSwitcherActive] = useState(false);
  const [compactSelectedIndex, setCompactSelectedIndex] = useState(0);
  const compactItemsRef = useRef<any[]>([]);
  const compactIndexRef = useRef(0);
`;
content = content.replace("const [isPinned, setIsPinned] = useState(true);", stateStr + "\n  const [isPinned, setIsPinned] = useState(true);");

const effectStr = `
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onCompactScroll((direction) => {
      setIsCompactSwitcherActive(true);
      
      // Compute items
      const folders = dataRef.current?.session?.folders || {};
      const items = [];
      const dNames = dataRef.current?.names || desktopNames;
      const dIcons = dataRef.current?.icons || desktopIcons;
      
      Object.entries(folders).forEach(([folderName, ids]) => {
         if (Array.isArray(ids)) {
           ids.forEach(fullId => {
             const id = fullId.split('___')[0];
             const name = dNames[id];
             if (name && name.toLowerCase() !== 'empty' && !name.toLowerCase().startsWith('desktop ')) {
               if (!items.find(i => i.id === id)) {
                 items.push({ id, name, folder: folderName, icons: dIcons[id] });
               }
             }
           });
         }
      });
      
      compactItemsRef.current = items;
      
      let next = compactIndexRef.current + (direction > 0 ? -1 : 1);
      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;
      
      compactIndexRef.current = next;
      setCompactSelectedIndex(next);
    });

    window.electronAPI.onCompactConfirm(() => {
      setIsCompactSwitcherActive(false);
      const items = compactItemsRef.current;
      const selected = items[compactIndexRef.current];
      if (selected) {
        handleSwitch(selected.id);
      }
    });
  }, [desktopNames, desktopIcons]);
`;

content = content.replace("// FAST REFRESH:", effectStr + "\n  // FAST REFRESH:");

const renderStr = `
      {isCompactSwitcherActive && (
        <CompactSwitcher 
          items={compactItemsRef.current} 
          selectedIndex={compactSelectedIndex} 
        />
      )}
`;

content = content.replace("{promptConfig && (", renderStr + "\n      {promptConfig && (");

fs.writeFileSync('src/App.tsx', content);
