import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const root = import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './', // static, offline-friendly (open dist/index.html directly)
  resolve: {
    alias: { '@': path.resolve(root, './src') },
  },
})
