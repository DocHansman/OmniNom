import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    // Notify the app that an update is available so it can show a prompt
    window.dispatchEvent(new CustomEvent('pwa-update-available', {
      detail: { update: () => updateSW(true) }
    }));
  },
  onOfflineReady() {
    console.log('OmniNom is ready for offline use.');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
