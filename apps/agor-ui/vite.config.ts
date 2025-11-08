import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Polyfill Node.js globals for browser compatibility
  define: {
    global: 'globalThis',
  },

  // Set base path for production builds (served from /ui by daemon)
  // In development, this is ignored (uses default /)
  base: process.env.NODE_ENV === 'production' ? '/ui/' : '/',

  // Mark Node.js-only packages as external so they're not bundled
  build: {
    rollupOptions: {
      external: ['@openai/codex-sdk', '@anthropic-ai/claude-agent-sdk', '@google/gemini-cli-core'],
    },
  },

  server: {
    // Bind to 0.0.0.0 for Codespaces/Docker accessibility
    host: '0.0.0.0',
    port: 5173,
    // Watch for changes in workspace packages
    watch: {
      // Watch the @agor/core dist directory for changes
      ignored: ['!**/node_modules/@agor/core/**'],
    },
    fs: {
      // Allow serving files from the monorepo root
      allow: ['../..'],
    },
  },
});
