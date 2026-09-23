const fs = require('fs');
let content = fs.readFileSync('/home/dod/Projects/My_Desktop_Manager/electron_ui/src/components/PromptModal.tsx', 'utf-8');

content = content.replace(
  'isConfirm?: boolean;',
  'isConfirm?: boolean;\n  isShortcutMode?: boolean;'
);

content = content.replace(
  'isConfirm, onSubmit, onCancel }: PromptModalProps)',
  'isConfirm, isShortcutMode, onSubmit, onCancel }: PromptModalProps)'
);

const oldInput = `
            <input 
              ref={inputRef}
              type="text" 
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
`;

const newInput = `
            <input 
              ref={inputRef}
              type="text" 
              value={value}
              onChange={(e) => {
                if (!isShortcutMode) {
                  setValue(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (isShortcutMode) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  
                  const key = e.key;
                  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return;
                  if (key === 'Escape') {
                    onCancel();
                    return;
                  }
                  if (key === 'Enter') {
                    onSubmit(value);
                    return;
                  }
                  if (key === 'Backspace') {
                    setValue('');
                    return;
                  }
                  
                  const modifiers = [];
                  if (e.metaKey) modifiers.push('Super');
                  if (e.ctrlKey) modifiers.push('CommandOrControl');
                  if (e.altKey) modifiers.push('Alt');
                  if (e.shiftKey) modifiers.push('Shift');
                  
                  let keyName = key.length === 1 ? key.toUpperCase() : key;
                  if (key === ' ') keyName = 'Space';
                  if (key === '+') keyName = 'Plus';
                  
                  setValue([...modifiers, keyName].join('+'));
                } else {
                  handleKeyDown(e);
                }
              }}
`;

if (content.includes('ref={inputRef}')) {
  content = content.replace(oldInput, newInput);
  fs.writeFileSync('/home/dod/Projects/My_Desktop_Manager/electron_ui/src/components/PromptModal.tsx', content);
  console.log("Patched PromptModal");
} else {
  console.log("Failed to patch");
}
