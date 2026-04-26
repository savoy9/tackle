import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // The VS-Code-extension-host suites are driven by Mocha + @vscode/test-electron,
    // not vitest. They import `vscode`, which only exists inside the extension host.
    // Their pure-logic unit tests (e.g. test/perf/__tests__/, test/visual/__tests__/,
    // test/runner/__tests__/) are picked up normally; the host-only files are
    // excluded below.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out-test/**',
      'test/bench/**',
      'test/integration/**',
      'test/runner/run-*.ts',
      'test/runner/launch.ts',
      'test/suite/**',
      'test/perf/perf.test.ts',
      'test/perf/scenarios.ts',
      'test/perf/vscode-provider.ts',
    ],
  },
});
