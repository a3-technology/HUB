import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 63898,
    proxy: {
      '/api': {
        target: 'https://localhost:7231',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
