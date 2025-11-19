import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Increase the chunk size warning limit to 1600kB (1.6MB) to silence the warning
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Automatically split vendor code (node_modules) into a separate file
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});