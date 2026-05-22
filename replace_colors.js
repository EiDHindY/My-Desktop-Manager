const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'electron_ui/src');

const replacements = {
  '#1a1b26': 'var(--bg-primary)',
  '#24283b': 'var(--bg-secondary)',
  '#1e2030': 'var(--bg-secondary)',
  '#7aa2f7': 'var(--accent-blue)',
  '#7dcfff': 'var(--accent-cyan)',
  '#bb9af7': 'var(--accent-purple)',
  '#f7768e': 'var(--accent-red)',
  '#9ece6a': 'var(--accent-green)',
  '#414868': 'var(--border-glass)',
  '#565f89': 'var(--text-dim)',
  '#9aa5ce': 'var(--text-main)',
  '#c0caf5': 'var(--text-main)',
  'var(--accent-purple, #bb9af7)': 'var(--accent-purple)'
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
    // Escape special characters for regex if needed, but these are simple hex codes
    const regex = new RegExp(key, 'gi');
    content = content.replace(regex, value);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
