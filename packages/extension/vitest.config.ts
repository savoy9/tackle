import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Bench + integration suites import vscode (only available inside the
    // VS Code test host) and run via Mocha, not vitest. Excluded here so
    // `bun --bun vitest run` only sees the unit tests.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out-test/**',
      'test/bench/**',
      'test/integration/**',
      'test/runner/**',
      'test/suite/**',
    ],
  },
});
