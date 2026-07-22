const fs = require('fs');

function fixModals() {
  ['src/components/CreateNoteModal.tsx', 'src/components/CreateTaskModal.tsx'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/const modalRef = useRef<HTMLDivElement>\(null\);/g, 'const modalRef = useRef<HTMLFormElement>(null);');
    fs.writeFileSync(file, content);
  });
}

function fixTasksTab() {
  const file = 'src/components/TasksTab.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Fix implicit any params
  content = content.replace(/const handleKeyDown = \(e\) =>/g, 'const handleKeyDown = (e: KeyboardEvent | React.KeyboardEvent) =>');
  content = content.replace(/const handleGlobalTyping = \(e\) =>/g, 'const handleGlobalTyping = (e: KeyboardEvent) =>');
  content = content.replace(/const isHighlighted = \(type, id\) =>/g, 'const isHighlighted = (type: string, id: string) =>');
  content = content.replace(/filter\(\(k\) => /g, 'filter((k: string) => ');
  
  // Fix visibleItems array type
  content = content.replace(/const visibleItems = \[\];/g, "const visibleItems: { type: 'folder' | 'task', id: string, folderName?: string }[] = [];");

  fs.writeFileSync(file, content);
}

function fixTempsTab() {
  const file = 'src/components/TempsTab.tsx';
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/handleDeployTemplate\(temp\.name\)/g, 'handleDeployTemplate(temp.filename, temp.name)');
  fs.writeFileSync(file, content);
}

try {
  fixModals();
  fixTasksTab();
  fixTempsTab();
  console.log('Fixed typescript errors');
} catch(e) {
  console.error(e);
}
