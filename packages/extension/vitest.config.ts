import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // `test/bench/*.test.ts` and `test/perf/*.test.ts` (the
    // VS-Code-extension-host suites driven by Mocha + @vscode/test-electron)
    // are not vitest-compatible: they import `vscode`, which only exists
    // inside the extension host. Their unit tests live in
    // `test/perf/__tests__/` and are picked up normally.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out-test/**',
      'test/bench/**',
      'test/perf/perf.test.ts',
      'test/perf/scenarios.ts',
      'test/perf/vscode-provider.ts',
    ],
  },
});
