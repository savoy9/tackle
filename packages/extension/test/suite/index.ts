import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 120_000,
    reporter: 'spec',
  });

  // Bun build aggressively inlines __dirname/__filename/module.filename at compile time.
  // The runner sets TACKLE_SUITE_DIR at runtime to point to the compiled suite directory.
  const suiteDir = process.env.TACKLE_SUITE_DIR ?? path.dirname(require.resolve('./index.js'));
  const testsRoot = path.resolve(suiteDir, '..');
  const files = await glob('bench/**/*.test.js', { cwd: testsRoot });
  for (const f of files) mocha.addFile(path.resolve(testsRoot, f));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} test(s) failed`));
      else resolve();
    });
  });
}
