import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the large, stable map engine cached when the application UI changes.
        manualChunks(id) {
          if (id.includes('node_modules') && id.includes('maplibre-gl')) return 'map-engine';
          if (
            id.includes('node_modules') &&
            (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
          )
            return 'react-vendor';
          if (id.includes('node_modules') && id.includes('/zod/')) return 'contracts';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same Wi-Fi for testing
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
