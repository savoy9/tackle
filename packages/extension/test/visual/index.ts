import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60_000,
    reporter: 'spec',
  });

  const suiteDir =
    process.env.TACKLE_VISUAL_SUITE_DIR ?? path.dirname(require.resolve('./index.js'));
  const files = await glob('**/*.test.js', { cwd: suiteDir, ignore: ['__tests__/**'] });
  for (const f of files) mocha.addFile(path.resolve(suiteDir, f));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} test(s) failed`));
      else resolve();
    });
  });
}
