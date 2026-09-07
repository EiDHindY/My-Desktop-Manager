const fs = require('fs');
const TurndownService = require('turndown');

const turndownService = new TurndownService();

// We want to handle the conversion cleanly
const rawData = fs.readFileSync('../synchronest_notes.json', 'utf8');
const notes = JSON.parse(rawData);

let markdownOutput = '# Synchronest Notes\n\n';

for (const note of notes) {
    markdownOutput += `## ${note.title}\n\n`;
    const formattedContent = turndownService.turndown(note.info);
    markdownOutput += `${formattedContent}\n\n---\n\n`;
}

fs.writeFileSync('../Synchronest_Notes.md', markdownOutput);
console.log('Successfully generated Synchronest_Notes.md');
