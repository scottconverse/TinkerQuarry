import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// TinkerQuarry recovery: proxy the real KimCad engine API so the forked Studio app calls
// /api/* (health, design, render, slice, ...) with no CORS. Phase 4: inject the dev session
// token on state-changing POSTs (the engine, run with TINKERQUARRY_DEV_TOKEN, accepts it).
// Shared between the dev server and `vite preview` (the release e2e lane) so both substrates
// reach the engine identically.
const engineProxy = {
  '/api': {
    target: 'http://127.0.0.1:8765',
    changeOrigin: true,
    // @ts-expect-error process is a nodejs global
    headers: { 'X-KimCad-Session': process.env.TINKERQUARRY_DEV_TOKEN || 'tq-dev-token' },
  },
};

// Serve WASM with cross-origin isolation (required for the engine's wasm workers) — needed on
// whichever server hosts the SPA, dev or preview.
const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

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
    proxy: engineProxy,
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
    headers: isolationHeaders,
  },
  // The release e2e lane (playwright) runs against BUILT assets served by `vite preview`, not
  // the dev server: a release gate must exercise what ships, and the dev client's
  // ws-reconnect full-page reload — the ONLY page-reload path in this stack (product code has
  // none) — must not exist under it. Same engine proxy + isolation headers as dev.
  preview: {
    strictPort: true,
    proxy: engineProxy,
    headers: isolationHeaders,
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
