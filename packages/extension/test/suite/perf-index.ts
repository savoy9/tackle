import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Perf-suite entry point. Mirrors `test/suite/index.ts` but loads only
 * the perf scenarios (not the latency benchmark, which is a separate
 * forensic regression anchor per ADR-0012).
 */
export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20 * 60_000,
    reporter: 'spec',
  });

  const suiteDir = process.env.TACKLE_PERF_SUITE_DIR
    ?? path.dirname(require.resolve('./index.js'));
  const testsRoot = path.resolve(suiteDir, '..');
  const files = await glob('perf/**/*.test.js', { cwd: testsRoot });
  for (const f of files) mocha.addFile(path.resolve(testsRoot, f));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} test(s) failed`));
      else resolve();
    });
  });
}
