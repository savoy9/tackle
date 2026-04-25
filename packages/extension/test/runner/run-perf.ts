import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * Perf runner — peer of `run-bench.ts`. Launches the VS Code extension
 * host with the stub Agent enabled (`tackle.defaultAgent = 'stub'`),
 * runs the perf suite, and writes results JSON to the path passed via
 * `TACKLE_PERF_OUTPUT`.
 *
 * The CI `perf` job uploads the output as an artifact and posts a PR
 * comment summarizing per-scenario min/max/mean.
 */
async function main(): Promise<void> {
  const runtimeDir = path.dirname(process.argv[1]);
  // runtimeDir = out-test/runner
  const extensionDevelopmentPath = path.resolve(runtimeDir, '..', '..');
  const extensionTestsPath = path.resolve(runtimeDir, '..', 'suite', 'perf-index.js');
  const perfOutput = process.env.TACKLE_PERF_OUTPUT
    ?? path.resolve(extensionDevelopmentPath, 'perf-results.json');

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      '--disable-extensions',
      '--disable-workspace-trust',
      '--enable-proposed-api=tackle.tackle',
    ],
    extensionTestsEnv: {
      TACKLE_PERF_SUITE_DIR: path.dirname(extensionTestsPath),
      TACKLE_PERF_OUTPUT: perfOutput,
      // The perf suite always uses the stub Agent — no test reaches
      // Anthropic. The extension reads this at activation time as a
      // fallback when no workspace setting overrides it.
      TACKLE_DEFAULT_AGENT: 'stub',
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
