import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same Wi-Fi for testing
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
