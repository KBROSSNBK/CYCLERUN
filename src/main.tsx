import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, getSettings } from './services/settingsService'
import './styles/index.css'

// El tema se aplica antes del primer render para evitar un destello de color.
applyTheme(getSettings().theme)

const container = document.getElementById('root')
if (!container) throw new Error('No se ha encontrado el elemento #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
