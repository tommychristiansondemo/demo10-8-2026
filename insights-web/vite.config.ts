import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'https://insights.awsteach.com', changeOrigin: true }, '/config.json': { target: 'https://insights.awsteach.com', changeOrigin: true } } },
  build: { chunkSizeWarningLimit: 900 },
});
