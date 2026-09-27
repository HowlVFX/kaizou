import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// The dev server proxies /api to Express so the portal stays same-origin.
// Override the target with VITE_API_PROXY_TARGET (env var or portal/.env*).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
