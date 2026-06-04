import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// When building for the Electron shell the renderer is loaded from the local
// filesystem (file://), so asset URLs must be relative. The web build is served
// from a domain root, so it keeps absolute paths.
const forElectron = process.env.ELECTRON === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: forElectron ? './' : '/',
  plugins: [react()],
  // Pin the dev port so the Electron launcher always knows where to connect.
  // strictPort makes Vite fail loudly if 5173 is taken rather than silently
  // relocating to 5174 (which left the old launcher hanging forever).
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
})
