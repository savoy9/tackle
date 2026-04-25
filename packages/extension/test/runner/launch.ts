import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * Shared VS Code launch helper for the four test runners (bench,
 * visual, perf, integration). Centralizes the path-resolution dance —
 * argv[1] → out-test/runner → extensionDevelopmentPath / suite path —
 * and the canonical `launchArgs` set so individual runners stay focused
 * on their own env-var wiring.
 *
 * Auto-detects the out-test layout: bun's common-prefix stripping puts
 * the compiled runner entry at either `out-test/runner` or
 * `out-test/test/runner` depending on which sibling files are bundled
 * together. We strip whichever suffix matches.
 */
export interface LaunchOptions {
  suiteRelativeToOutTest: string;
  /** Positional launchArgs that must come BEFORE the canonical flags (e.g. workspace folder). */
  extraLaunchArgs?: string[];
  /** Env vars forwarded to the extension host. */
  env?: Record<string, string | undefined>;
}

const BASE_LAUNCH_ARGS = [
  '--disable-extensions',
  '--disable-workspace-trust',
  '--enable-proposed-api=tackle.tackle',
];

/**
 * Resolve the `out-test/` root from the runner's runtime directory,
 * stripping whichever of `runner` or `test/runner` is present. Exported
 * for unit tests; the launcher itself derives `runtimeDir` from
 * `process.argv[1]`.
 */
export function resolveOutTestRoot(runtimeDir: string): string {
  return runtimeDir.replace(/[\\/](?:test[\\/])?runner$/, '');
}

export async function launchVsCodeSuite(opts: LaunchOptions): Promise<number> {
  // Bun build inlines __dirname to the source path; derive at runtime from argv[1].
  const runtimeDir = path.dirname(process.argv[1]);
  const outTestRoot = resolveOutTestRoot(runtimeDir);
  const extensionDevelopmentPath = path.resolve(outTestRoot, '..');
  const extensionTestsPath = path.resolve(outTestRoot, opts.suiteRelativeToOutTest);

  // Drop undefined values so callers can pass `process.env.X` conditionally.
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v !== undefined) cleanEnv[k] = v;
  }

  // launchArgs ordering invariant: positional args (workspace folder)
  // must precede the canonical flags so VS Code parses them correctly.
  return runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [...(opts.extraLaunchArgs ?? []), ...BASE_LAUNCH_ARGS],
    extensionTestsEnv: cleanEnv,
  });
}
