import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered } from 'lucide-react';

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoFocus?: boolean;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const btnStyle = (isActive: boolean) => ({
    background: 'transparent',
    border: 'none',
    color: isActive ? 'var(--accent-blue)' : 'var(--text-dim)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    backgroundColor: isActive ? 'rgba(0, 43, 54, 0.8)' : 'transparent',
  });

  return (
    <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', borderBottom: '1px solid var(--border-glass)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        style={btnStyle(editor.isActive('bold'))}
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        style={btnStyle(editor.isActive('italic'))}
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        style={btnStyle(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </button>
      
      <div style={{ width: '1px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
      
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        style={btnStyle(editor.isActive('heading', { level: 1 }))}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        style={btnStyle(editor.isActive('heading', { level: 2 }))}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </button>
      
      <div style={{ width: '1px', backgroundColor: 'var(--border-glass)', margin: '0 4px' }} />
      
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        style={btnStyle(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        <List size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        style={btnStyle(editor.isActive('orderedList'))}
        title="Ordered List"
      >
        <ListOrdered size={16} />
      </button>
    </div>
  );
};

export default function TiptapEditor({ value, onChange, onBlur, autoFocus }: TiptapEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content',
        style: 'outline: none; padding: 12px; min-height: 80px; color: var(--text-dim); font-size: 13px; font-family: inherit; cursor: text;'
      }
    }
  });

  useEffect(() => {
    if (editor && autoFocus) {
      setTimeout(() => editor.commands.focus('end'), 10);
    }
  }, [editor, autoFocus]);

  // We do NOT use global mousedown for blur because it interferes with other interactions
  // Instead, the parent component handles click-outside logic already (in NotesTab.tsx)

  return (
    <div 
      ref={wrapperRef}
      className="tiptap-wrapper"
      style={{
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--border-glass)',
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.2)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuBar editor={editor} />
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          maxHeight: '350px',
          cursor: 'text'
        }}
        onClick={() => {
          if (editor) editor.commands.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onBlur();
          } else if (e.key === 'Enter' && e.ctrlKey) {
            onBlur();
          } else if (e.key.toLowerCase() === 's' && e.ctrlKey) {
            e.preventDefault();
            onBlur();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
      
      <style>{`
        .tiptap-wrapper button:hover {
          background-color: rgba(255, 255, 255, 0.1) !important;
        }
        .tiptap-editor-content p {
          margin: 0 0 0.5em 0;
        }
        .tiptap-editor-content p:last-child {
          margin-bottom: 0;
        }
        .tiptap-editor-content ul, .tiptap-editor-content ol {
          padding-left: 1.5rem;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
        }
        .tiptap-editor-content h1 {
          font-size: 1.5em;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: var(--text-main);
        }
        .tiptap-editor-content h2 {
          font-size: 1.25em;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: var(--text-main);
        }
      `}</style>
    </div>
  );
}
