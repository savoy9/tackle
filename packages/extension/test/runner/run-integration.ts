import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * Integration test entry point — peer of `run-bench.ts` (#62).
 *
 * Launches a real VS Code via `@vscode/test-electron` against a fresh
 * temp workspace, points the harness at the compiled integration suite
 * (`out-test/suite/integration-index.js`), and forwards the
 * `TACKLE_TEST_*` env vars consumed by the production code paths
 * (`mode-manager.ts`, `claude-jsonl-detector.ts`, `workspace-guard.ts`,
 * `psmux-bridge.ts`) plus the stub Agent (#65).
 *
 * Per ADR-0012: integration jobs are advisory in CI. This runner
 * exits with the suite's exit code so a failing flow surfaces in CI
 * logs without blocking merge.
 */
async function main(): Promise<void> {
  const runtimeDir = path.dirname(process.argv[1]);
  // runtimeDir = out-test/test/runner (or out-test/runner — depends on bun's
  // common-prefix stripping for the entry-point set). Walk up to the
  // out-test root and re-derive the suite path so the same script works
  // regardless of nesting.
  const outTestRoot = runtimeDir.replace(/[\\/](?:test[\\/])?runner$/, '');
  const extensionDevelopmentPath = path.resolve(outTestRoot, '..');
  const suiteSubdir = fs.existsSync(path.join(outTestRoot, 'test', 'suite', 'integration-index.js'))
    ? path.join('test', 'suite')
    : 'suite';
  const extensionTestsPath = path.resolve(outTestRoot, suiteSubdir, 'integration-index.js');

  // Per-run scratch root. Each test file mkdtemp's its own workspace
  // under here in suite-setup so cleanup is by-process.
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tackle-it-'));
  const psmuxPrefix = `tackleit-${process.pid}-`;
  const jsonlDir = path.join(scratchRoot, 'jsonl');
  fs.mkdirSync(jsonlDir, { recursive: true });

  // Single shared workspace for the whole suite. VS Code can't transition
  // from no-folder to a folder mid-process without a restart, so the
  // runner pre-creates the workspace and passes it via launchArgs.
  // Per-test isolation is provided by wiping `.tackle/` in suite-setup.
  const workspaceDir = fs.mkdtempSync(path.join(scratchRoot, 'ws-'));
  const dotVscode = path.join(workspaceDir, '.vscode');
  fs.mkdirSync(dotVscode, { recursive: true });
  fs.writeFileSync(
    path.join(dotVscode, 'settings.json'),
    JSON.stringify({ 'tackle.defaultAgent': 'stub' }, null, 2),
  );
  fs.mkdirSync(path.join(workspaceDir, '.tackle'), { recursive: true });

  // Worktree-aware flows (#2, #5) require the workspace to be a real git
  // repo. Initialize one with a single commit on `main` so worktree
  // `add` / `prune` succeed without network or remote setup.
  const git = (...args: string[]): void => {
    cp.execSync(`git ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
      cwd: workspaceDir, stdio: 'ignore',
    });
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'tackle-it@example.com');
    git('config', 'user.name', 'Tackle Integration');
    git('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# fixture\n');
    git('add', '.');
    git('commit', '-m', 'initial');
  } catch (err) {
    console.error('git init failed', err);
  }

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      workspaceDir,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--enable-proposed-api=tackle.tackle',
    ],
    extensionTestsEnv: {
      TACKLE_SUITE_DIR: path.dirname(extensionTestsPath),
      TACKLE_SUITE_KIND: 'integration',
      TACKLE_TEST_SCRATCH_ROOT: scratchRoot,
      TACKLE_TEST_WORKSPACE: workspaceDir,
      TACKLE_TEST_PSMUX_PREFIX: psmuxPrefix,
      TACKLE_TEST_JSONL_DIR: jsonlDir,
      TACKLE_TEST_STUB_SCENARIO: process.env.TACKLE_TEST_STUB_SCENARIO ?? 'idle-working-idle',
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
