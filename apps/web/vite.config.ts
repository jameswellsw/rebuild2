import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Hosted builds live under a subpath (GitHub Pages serves a project site from
// /<repo>/). VITE_BASE carries that path so assets, the router and the service
// worker all agree on it. Local dev and root hosting keep the default '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 3000 },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
});
