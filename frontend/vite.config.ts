import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Django runs on :8000 (override with DJANGO_URL). In development, open the Vite server (:5173); it
// proxies everything Django owns. In production, Django serves the built files from dist/ under /static/.
// 127.0.0.1 rather than localhost: Node may resolve localhost to IPv6, where runserver doesn't listen.
const django = process.env.DJANGO_URL ?? 'http://127.0.0.1:8000'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    proxy: {
      '/api': django,
      '/r/': django,
      '/admin': django,
      '/static/admin': django,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
}))
