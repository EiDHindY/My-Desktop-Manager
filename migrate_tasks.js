const fs = require('fs');
const path = require('path');
const os = require('os');

const tasksPath = path.join(os.homedir(), '.config', 'desktop-manager', 'tasks.json');
const notesPath = path.join(os.homedir(), '.config', 'desktop-manager', 'notes_new.json');

const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));

// Migrate Tasks
for (const [folderName, folderTasks] of Object.entries(tasks.live || {})) {
  if (tasks.templates[folderName]) {
    tasks.templates[folderName].push(...folderTasks);
  } else {
    tasks.general.push(...folderTasks);
  }
}
tasks.live = {};

// Migrate Notes
for (const [folderName, folderNotes] of Object.entries(notes.live || {})) {
  if (notes.templates[folderName]) {
    notes.templates[folderName].push(...folderNotes);
  } else {
    notes.general.push(...folderNotes);
  }
}
notes.live = {};

fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));

console.log('Migration complete');
