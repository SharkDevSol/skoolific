import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`,
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-axios': ['axios'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 6006,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    port: 6005,
    },
    https: fs.existsSync('./certs/cert.pem') ? {
      key: fs.readFileSync('./certs/key.pem'),
      cert: fs.readFileSync('./certs/cert.pem'),
    } : false,
    proxy: {
      '/api': {
        target: 'http://localhost:6005', 
        changeOrigin: true,
        rewrite: (path) => path,
        configure: (proxy, options) => {
          // Log proxy requests for debugging
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying:', req.method, req.url, '→', options.target + req.url);
          });
        }
      }
    }
  }
});