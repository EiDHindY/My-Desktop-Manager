const fs = require('fs');

function fixTasksTab() {
  const file = 'src/components/TasksTab.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Fix visibleItems array type
  content = content.replace(/const visibleItems: \{ type: 'folder' \| 'task', id: string, folderName\?: string \}\[\] = \[\];/g, 
    "const visibleItems: { type: 'general' | 'live' | 'templates', id: string | null }[] = [];");

  // Fix custom event listener types
  content = content.replace(/window\.addEventListener\('global-typing-intercept', handleGlobalTyping\);/g, 
    "window.addEventListener('global-typing-intercept', handleGlobalTyping as EventListener);");
  content = content.replace(/window\.removeEventListener\('global-typing-intercept', handleGlobalTyping\);/g, 
    "window.removeEventListener('global-typing-intercept', handleGlobalTyping as EventListener);");

  // Fix isHighlighted signature to accept null
  content = content.replace(/const isHighlighted = \(type: string, id: string\) =>/g, 
    "const isHighlighted = (type: string, id: string | null) =>");

  fs.writeFileSync(file, content);
}

try {
  fixTasksTab();
  console.log('Fixed typescript errors in TasksTab.tsx');
} catch(e) {
  console.error(e);
}
