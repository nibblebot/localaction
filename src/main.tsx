import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './serviceWorkerRegistration.ts'
import { installLongPressArming } from './components/dnd/longPressArming.ts'

registerServiceWorker()
installLongPressArming()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
