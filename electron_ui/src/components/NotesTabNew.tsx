export default function NotesTabNew({ notesData, sessionData, templates, searchQuery = '', onAction }: { notesData: any, sessionData: any, templates: any[], searchQuery?: string, onAction?: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', color: 'var(--text-main)', padding: '20px' }}>
      <h2 style={{ color: 'var(--accent-purple)' }}>Notes Tab</h2>
      <p style={{ color: 'var(--text-dim)' }}>Blank canvas ready for the new UI.</p>
    </div>
  );
}
