import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Exposed for browser-driven testing during development.
if (import.meta.env.DEV) {
  Promise.all([import('./game/store'), import('chess.js')]).then(([{ useGame, analyzePosition }, { Chess }]) =>
    Object.assign(window, { __game: useGame, __Chess: Chess, __analyze: analyzePosition }),
  )
}
