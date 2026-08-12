import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.addEventListener('error', (event) => {
  if (window.electronAPI?.executeCommand) {
    window.electronAPI.executeCommand(`echo "${event.message} at ${event.filename}:${event.lineno}" >> /tmp/electron_error.log`);
  }
});

import CompactSwitcherApp from './CompactSwitcherApp.tsx'
import StandaloneNote from './StandaloneNote.tsx'

const isSwitcher = window.location.search.includes('switcher=true');
const isStandaloneNote = window.location.search.includes('standaloneNote=true');
const noteId = new URLSearchParams(window.location.search).get('noteId') || '';

createRoot(document.getElementById('root')!).render(
  <>
    {isSwitcher ? <CompactSwitcherApp /> : isStandaloneNote ? <StandaloneNote noteId={noteId} /> : <App />}
  </>,
)
