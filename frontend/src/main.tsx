// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // Your global styles
import { Toaster } from "@/components/ui/sonner"; // CHANGED: Import Toaster from sonner

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster richColors position="bottom-right" /> {/* CHANGED: Add sonner's Toaster. Added richColors and position. */}
  </React.StrictMode>,
)
