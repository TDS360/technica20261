import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Section 1's store imports node:fs for optional file persistence;
      // it is never used in the browser, so alias it to an empty stub.
      'node:fs': fileURLToPath(new URL('./src/lib/stub-node-fs.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
