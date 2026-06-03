import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-host the default fonts so every device measures and renders with a
// byte-identical font binary. The Google Fonts CDN serves different files per
// User-Agent and loads asynchronously, which made pagination diverge between
// desktop and iPad (same markdown → different page count).
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import './index.css'
import App from './App'

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
