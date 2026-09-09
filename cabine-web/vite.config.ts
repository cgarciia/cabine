import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/ws': { target: backend, ws: true, changeOrigin: true },
      '/scales': { target: backend, changeOrigin: true },
      '/people': { target: backend, changeOrigin: true },
      '/measurements': { target: backend, changeOrigin: true },
      '/users': { target: backend, changeOrigin: true },
      '/login': { target: backend, changeOrigin: true },
      '/health': { target: backend, changeOrigin: true },
      '/fhir': { target: backend, changeOrigin: true },
    },
  },
})
