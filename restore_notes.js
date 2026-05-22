const fs = require('fs');

const currentPath = '/home/dod/.config/desktop-manager/notes.json';
const bakPath = '/home/dod/.config/desktop-manager/notes.json.bak';

const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
let bakLines = fs.readFileSync(bakPath, 'utf8').split('\\n');

// Take only the first 82 lines to form valid JSON
const bakStr = bakLines.slice(0, 82).join('\\n');

console.log("Parsing backup...");
const bak = JSON.parse(bakStr);

// Build a map of old items
const oldItems = {};
for (const folder of Object.values(bak.folders)) {
  for (const item of folder) {
    oldItems[item.id] = item;
  }
}

// Restore lost properties to current items
let restoredCount = 0;
for (const folderKey of Object.keys(current.folders)) {
  const folder = current.folders[folderKey];
  for (let i = 0; i < folder.length; i++) {
    const item = folder[i];
    const oldItem = oldItems[item.id];
    
    if (oldItem) {
      if (oldItem.type === 'note') {
        item.type = 'note';
        item.content = oldItem.content || '';
        restoredCount++;
        console.log(`Restored note: ${item.text}`);
      }
    }
  }
}

console.log(`Restored ${restoredCount} notes.`);
fs.writeFileSync(currentPath, JSON.stringify(current, null, 2));
