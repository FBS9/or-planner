import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ORPlannerApp from './App.jsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ORPlannerApp />
  </React.StrictMode>,
)
