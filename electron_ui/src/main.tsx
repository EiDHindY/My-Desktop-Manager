import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.addEventListener('error', (event) => {
  if (window.electronAPI?.executeCommand) {
    window.electronAPI.executeCommand(`echo "${event.message} at ${event.filename}:${event.lineno}" >> /tmp/electron_error.log`);
  }
});

createRoot(document.getElementById('root')!).render(
  <>
    <App />
  </>,
)
