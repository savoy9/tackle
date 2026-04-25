import * as path from 'node:path';
import { launchVsCodeSuite } from './launch';

async function main(): Promise<void> {
  const visualSuiteDir = path.resolve(path.dirname(process.argv[1]), '..', 'visual');
  const exitCode = await launchVsCodeSuite({
    suiteRelativeToOutTest: path.join('visual', 'index.js'),
    env: {
      TACKLE_VISUAL_SUITE_DIR: visualSuiteDir,
      // Forward UPDATE_SNAPSHOTS so the in-VSCode mocha process sees it.
      UPDATE_SNAPSHOTS: process.env.UPDATE_SNAPSHOTS,
      UPDATE_SNAPSHOT_NAME: process.env.UPDATE_SNAPSHOT_NAME,
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
