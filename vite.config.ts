import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()],
  build: {
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: {
      // npm run dev (HMR) sırasında API'yi demo sunucusuna aktarır.
      // Önce: npm run dev:api
      '/api': 'http://localhost:8787',
    },
  },
})
