import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In Docker Compose the backend is reachable at http://backend:8000.
// For local dev (no Docker) it runs at http://localhost:8000.
// Override with VITE_PROXY_TARGET if needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8002'
  const wsTarget = target.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
