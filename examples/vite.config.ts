import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { treem: path.resolve(__dirname, '../src/index.ts') },
  },
  build: {
    rollupOptions: {
      input: {
        main:           path.resolve(__dirname, 'index.html'),
        counter:        path.resolve(__dirname, 'counter/index.html'),
        shop:           path.resolve(__dirname, 'shop/index.html'),
        pricing:        path.resolve(__dirname, 'pricing/index.html'),
        wizard:         path.resolve(__dirname, 'wizard/index.html'),
        'traffic-light': path.resolve(__dirname, 'traffic-light/index.html'),
        'react-todo':   path.resolve(__dirname, 'react-todo/index.html'),
        devtool:        path.resolve(__dirname, 'devtool/index.html'),
        search:         path.resolve(__dirname, 'search/index.html'),
      },
    },
  },
})
