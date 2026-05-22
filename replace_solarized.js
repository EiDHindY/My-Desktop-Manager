const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'electron_ui/src');

const replacements = {
  '15, 23, 42': '0, 33, 43',      // bg-app
  '30, 41, 59': '7, 54, 66',      // bg-secondary
  '59, 130, 246': '38, 139, 210', // accent-blue
  '14, 165, 233': '42, 161, 152', // accent-cyan
  '139, 92, 246': '108, 113, 196',// accent-purple
  '239, 68, 68': '220, 50, 47',   // accent-red
  '34, 197, 94': '133, 153, 0',   // accent-green
  '51, 65, 85': '88, 110, 117'    // border-glass
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(directoryPath);
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(key, 'gi');
    content = content.replace(regex, value);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
