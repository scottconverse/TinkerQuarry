import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // TinkerQuarry recovery: proxy the real KimCad engine API so the forked Studio app calls
    // /api/* (health, design, render, slice, ...) with no CORS. Phase 4: inject the dev session
    // token on state-changing POSTs (the engine, run with TINKERQUARRY_DEV_TOKEN, accepts it).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        headers: { 'X-KimCad-Session': process.env.TINKERQUARRY_DEV_TOKEN || 'tq-dev-token' },
      },
    },
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    headers: {
      // Serve WASM files with correct MIME type
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  // Ensure WASM files are served with correct MIME type
  optimizeDeps: {
    exclude: ['web-tree-sitter'],
  },
  build: {
    sourcemap: false,
  },
  // Configure asset handling for WASM files
  assetsInclude: ['**/*.wasm'],
  // Explicitly copy WASM files to dist during build
  publicDir: 'public',
}));
