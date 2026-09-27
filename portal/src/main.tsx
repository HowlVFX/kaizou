import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { PortalGate } from './components/PortalGate'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PortalGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PortalGate>
  </React.StrictMode>,
)
