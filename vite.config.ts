import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';

// https://vitejs.dev/config/
const runCryptoBot = () => {
  let proc: any;
  const isCryptoBotRunning = async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1000);
      const res = await fetch('http://localhost:3002/ai_status', { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  };
  return {
    name: 'run-crypto-bot',
    async configureServer(server) {
      if (proc) return;
      const already = await isCryptoBotRunning();
      if (already) {
        console.log('[DevPlugin] Crypto bot detected on :3002 — skipping spawn');
        return;
      }
      const cmd = process.platform === 'win32' ? 'npm' : 'npm';
      proc = spawn(cmd, ['run', 'crypto-bot'], { stdio: 'inherit', shell: true });
      const stop = () => { try { proc.kill(); } catch {} proc = undefined; };
      server.httpServer?.once('close', stop);
      if (proc && typeof proc.on === 'function') {
        proc.on('exit', async () => {
          proc = undefined;
          setTimeout(async () => {
            if (!proc && server.httpServer) {
              const up = await isCryptoBotRunning();
              if (up) return;
              proc = spawn(cmd, ['run', 'crypto-bot'], { stdio: 'inherit', shell: true });
              if (proc && typeof proc.on === 'function') proc.on('exit', () => { proc = undefined; });
            }
          }, 2000);
        });
      }
    }
  };
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, '')
      }
    }
  },
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
