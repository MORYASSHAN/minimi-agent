import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs separately (server/index.ts); the dev server proxies to it, including SSE.
    // Regex key: a plain '/api' prefix would also swallow the client's own /api.ts module.
    proxy: { '^/api/': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
  test: { root: '.', include: ['test/**/*.test.ts'], environment: 'node' },
});
