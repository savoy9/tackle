import * as path from 'node:path';
import { launchVsCodeSuite } from './launch';

/**
 * Perf runner — peer of `run-bench.ts`. Launches the VS Code extension
 * host against the perf workspace (whose `.vscode/settings.json` selects
 * the stub Agent) and writes results JSON to the path passed via
 * `TACKLE_PERF_OUTPUT`.
 *
 * The CI `perf` job uploads the output as an artifact and posts a PR
 * comment summarizing per-scenario min/max/mean.
 */
async function main(): Promise<void> {
  const perfSuiteDir = path.resolve(path.dirname(process.argv[1]), '..', 'suite');
  const extensionDevelopmentPath = path.resolve(path.dirname(process.argv[1]), '..', '..');
  const perfOutput = process.env.TACKLE_PERF_OUTPUT
    ?? path.resolve(extensionDevelopmentPath, 'perf-results.json');

  const exitCode = await launchVsCodeSuite({
    suiteRelativeToOutTest: path.join('suite', 'perf-index.js'),
    env: {
      TACKLE_PERF_SUITE_DIR: perfSuiteDir,
      TACKLE_PERF_OUTPUT: perfOutput,
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
