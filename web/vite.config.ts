import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` proxies /api and /config.json to the deployed site so the UI can be developed locally.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'https://www.awsteach.com', changeOrigin: true }, '/config.json': { target: 'https://www.awsteach.com', changeOrigin: true } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
