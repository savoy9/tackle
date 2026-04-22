import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // Bun build inlines __dirname to the source path; derive at runtime from argv[1] instead.
  const runtimeDir = path.dirname(process.argv[1]);
  // runtimeDir = out-test/runner
  const extensionDevelopmentPath = path.resolve(runtimeDir, '..', '..');
  const extensionTestsPath = path.resolve(runtimeDir, '..', 'suite', 'index.js');

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      '--disable-extensions',
      '--disable-workspace-trust',
      '--enable-proposed-api=tackle.tackle',
    ],
    extensionTestsEnv: {
      TACKLE_SUITE_DIR: path.dirname(extensionTestsPath),
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
