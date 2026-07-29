import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:8000'
    },
    watch: {
      usePolling: true,
      interval: 300,
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
})
