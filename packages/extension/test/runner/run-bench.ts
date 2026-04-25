import * as path from 'node:path';
import { launchVsCodeSuite } from './launch';

async function main(): Promise<void> {
  const exitCode = await launchVsCodeSuite({
    suiteRelativeToOutTest: path.join('suite', 'index.js'),
    env: {
      TACKLE_SUITE_DIR: path.resolve(path.dirname(process.argv[1]), '..', 'suite'),
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
