import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve the shims directory once so aliases are bullet-proof.
const shimsDir = fileURLToPath(
  new URL('./node_modules/vite-plugin-node-polyfills/shims', import.meta.url),
);

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    // top-level-await is natively supported with build.target = 'esnext'
    nodePolyfills({
      globals: { Buffer: true, global: true },
    }),
  ],
  resolve: {
    alias: [
      // Pin polyfill shims so root-level Midnight packages can resolve them.
      {
        find: /^vite-plugin-node-polyfills\/shims\/(.*)/,
        replacement: path.join(shimsDir, '$1'),
      },
      // Pin compact-js to web's copy so TypeId Symbol matches between CompiledContract and midnight-js-contracts.
      {
        find: '@midnight-ntwrk/compact-js',
        replacement: fileURLToPath(
          new URL('./node_modules/@midnight-ntwrk/compact-js', import.meta.url),
        ),
      },
      // Pin compact-runtime to web's copy for Vercel builds.
      {
        find: '@midnight-ntwrk/compact-runtime',
        replacement: fileURLToPath(
          new URL('./node_modules/@midnight-ntwrk/compact-runtime', import.meta.url),
        ),
      },
      // Pin onchain-runtime-v3 to web's copy so StateValue instanceof passes.
      {
        find: '@midnight-ntwrk/onchain-runtime-v3',
        replacement: fileURLToPath(
          new URL('./node_modules/@midnight-ntwrk/onchain-runtime-v3', import.meta.url),
        ),
      },
      // Pin ledger-v8 to web's copy.
      {
        find: '@midnight-ntwrk/ledger-v8',
        replacement: fileURLToPath(
          new URL('./node_modules/@midnight-ntwrk/ledger-v8', import.meta.url),
        ),
      },
      // Pin midnight-js-contracts to web's copy.
      {
        find: '@midnight-ntwrk/midnight-js-contracts',
        replacement: fileURLToPath(
          new URL('./node_modules/@midnight-ntwrk/midnight-js-contracts', import.meta.url),
        ),
      },
      // Single alias so every component imports reserves from one path.
      {
        find: '@reserves',
        replacement: fileURLToPath(new URL('../src/reserves.ts', import.meta.url)),
      },
      // ESM shim for object-inspect
      {
        find: 'object-inspect',
        replacement: fileURLToPath(new URL('./src/shims/object-inspect.ts', import.meta.url)),
      },
    ],
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
  },
  build: {
    // esnext supports top-level await natively — no plugin needed.
    // Anyone using the Lace wallet has a modern browser.
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: [
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/midnight-js-contracts',
    ],
  },
});
