import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the large, stable map engine cached when the application UI changes.
        manualChunks(id) {
          if (
            id.includes('node_modules') &&
            (id.includes('/@elevenlabs/') ||
              id.includes('/livekit-client/') ||
              id.includes('/@livekit/'))
          )
            return 'voice-engine';
          if (id.includes('node_modules') && id.includes('maplibre-gl')) return 'map-engine';
          if (
            id.includes('node_modules') &&
            (id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/'))
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
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
