import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import wasmPack from 'vite-plugin-wasm-pack'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // In production (GitHub Pages) the site lives at /NCRN/.
  // During local dev it lives at / to avoid path headaches.
  base: command === 'build' ? '/NCRN/' : '/',

  plugins: [
    // wasmPack must be listed before vue so WASM bindings are
    // resolved before Vue processes component imports.
    wasmPack(['../crates/core']),
    vue(),
    vuetify({ autoImport: true }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // WebLLM runtime is inherently ~6 MB; raise the limit so Rollup doesn't
    // emit a spurious warning that can't be resolved by further splitting.
    chunkSizeWarningLimit: 8_000,
    rollupOptions: {
      output: {
        // Isolate WebLLM into its own chunk so it can be cached independently
        // of app code and doesn't inflate the main bundle.
        manualChunks: {
          'web-llm': ['@mlc-ai/web-llm'],
        },
      },
    },
  },

  // WebLLM uses internal dynamic imports for model loading; excluding it from
  // Vite's pre-bundling step prevents the optimizer from interfering with them.
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
}))
