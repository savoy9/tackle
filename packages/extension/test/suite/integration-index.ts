import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Mocha entry point for the integration suite (#66).
 *
 * Mirrors `suite/index.ts` (the bench harness) but globs
 * `integration/**\/*.test.js` instead. Suite-setup runs as `before` /
 * `after` hooks declared inside each integration test file, NOT here —
 * keeping the entry point a thin file-loader matches the bench shape.
 */
export async function run(): Promise<void> {
  const reporter = process.env.TACKLE_MOCHA_REPORTER ?? 'spec';
  const reporterOptions =
    reporter === 'mocha-junit-reporter' && process.env.TACKLE_MOCHA_JUNIT_OUT
      ? { mochaFile: process.env.TACKLE_MOCHA_JUNIT_OUT }
      : undefined;

  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60_000,
    reporter,
    reporterOptions,
  });

  const suiteDir = process.env.TACKLE_SUITE_DIR ?? path.dirname(require.resolve('./integration-index.js'));
  const testsRoot = path.resolve(suiteDir, '..');
  const files = await glob('integration/**/*.test.js', { cwd: testsRoot });
  for (const f of files) mocha.addFile(path.resolve(testsRoot, f));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} test(s) failed`));
      else resolve();
    });
  });
}
