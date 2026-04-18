import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Main process tests don't need jsdom — override per-file
    environmentMatchGlobs: [
      ['src/main/**/*.test.ts', 'node'],
    ],
  },
});
