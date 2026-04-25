import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * Shared VS Code launch helper for the four test runners (bench,
 * visual, perf, integration). Centralizes the path-resolution dance —
 * argv[1] → out-test/runner → extensionDevelopmentPath / suite path —
 * and the canonical `launchArgs` set so individual runners stay focused
 * on their own env-var wiring.
 *
 * `suiteRelativeToOutTest`: path of the compiled suite entry point
 * relative to `out-test/`, e.g. `suite/perf-index.js`. The integration
 * runner overrides `outTestRootOverride` because bun's common-prefix
 * stripping can place its compiled entry at either `out-test/runner` or
 * `out-test/test/runner` depending on which sibling files are bundled.
 */
export interface LaunchOptions {
  suiteRelativeToOutTest: string;
  /** Extra args to append after the canonical baseline. */
  extraLaunchArgs?: string[];
  /** Env vars forwarded to the extension host. `TACKLE_*_SUITE_DIR` is set automatically. */
  env?: Record<string, string | undefined>;
  /**
   * Override the resolved out-test root. Used by run-integration which
   * walks up via a regex to handle bun's variable nesting.
   */
  outTestRootOverride?: string;
}

const BASE_LAUNCH_ARGS = [
  '--disable-extensions',
  '--disable-workspace-trust',
  '--enable-proposed-api=tackle.tackle',
];

export async function launchVsCodeSuite(opts: LaunchOptions): Promise<number> {
  // Bun build inlines __dirname to the source path; derive at runtime from argv[1].
  const runtimeDir = path.dirname(process.argv[1]);
  const outTestRoot = opts.outTestRootOverride ?? path.resolve(runtimeDir, '..');
  const extensionDevelopmentPath = path.resolve(outTestRoot, '..');
  const extensionTestsPath = path.resolve(outTestRoot, opts.suiteRelativeToOutTest);

  // Drop undefined values so callers can pass `process.env.X` conditionally.
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v !== undefined) cleanEnv[k] = v;
  }

  return runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [...(opts.extraLaunchArgs ?? []), ...BASE_LAUNCH_ARGS],
    extensionTestsEnv: cleanEnv,
  });
}
