import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // Required for reliable HMR when running Vite inside Docker on Windows bind mounts.
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      interval: Number(process.env.CHOKIDAR_INTERVAL ?? 100),
    },
  },
})

