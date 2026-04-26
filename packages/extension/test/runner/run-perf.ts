import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { launchVsCodeSuite, resolveOutTestRoot } from './launch';

/**
 * Perf runner — peer of `run-integration.ts`. Launches the VS Code
 * extension host against a freshly-minted git workspace whose
 * `.vscode/settings.json` selects the stub Agent, and writes results
 * JSON to the path passed via `TACKLE_PERF_OUTPUT`.
 *
 * Mirrors the integration runner's TACKLE_TEST_* wiring so the
 * production code paths (`mode-manager.ts`, `workspace-guard.ts`,
 * `psmux-bridge.ts`) and the perf shims (`tackle._perfSeedTask` /
 * `tackle._perfSpawnSession`) all have a real workspace + DB to
 * operate on. Without this the perf suite cannot meaningfully run —
 * `tackle.activate` would short-circuit on the workspace guard.
 *
 * The CI `perf` job uploads the output as an artifact and posts a PR
 * comment summarizing per-scenario min/max/mean.
 */
async function main(): Promise<void> {
  // bun's common-prefix stripping can place compiled outputs at either
  // `out-test/suite/` or `out-test/test/suite/`; probe and pick.
  const outTestRoot = resolveOutTestRoot(path.dirname(process.argv[1]));
  const suiteSubdir = fs.existsSync(path.join(outTestRoot, 'test', 'suite', 'perf-index.js'))
    ? path.join('test', 'suite')
    : 'suite';
  const suiteRelativeToOutTest = path.join(suiteSubdir, 'perf-index.js');

  const extensionDevelopmentPath = path.resolve(outTestRoot, '..');
  const perfOutput = process.env.TACKLE_PERF_OUTPUT
    ?? path.resolve(extensionDevelopmentPath, 'perf-results.json');

  // Per-run scratch root. Mirrors run-integration.ts so the perf suite
  // gets the same fresh workspace + per-process psmux prefix isolation.
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tackle-perf-'));
  const psmuxPrefix = `tackleperf-${process.pid}-`;
  const jsonlDir = path.join(scratchRoot, 'jsonl');
  fs.mkdirSync(jsonlDir, { recursive: true });

  // Best-effort cleanup on exit (Windows tmp lifecycles aren't reliable).
  process.on('exit', () => {
    try {
      fs.rmSync(scratchRoot, { recursive: true, force: true });
    } catch {
      /* ignore — cleanup is best-effort */
    }
  });

  // Fresh single-folder workspace. Pre-create with .vscode/settings.json
  // selecting the stub agent and an empty .tackle/ directory. VS Code
  // can't transition from no-folder to a folder without a relaunch,
  // so the runner pre-creates the workspace and passes it via launchArgs.
  const workspaceDir = fs.mkdtempSync(path.join(scratchRoot, 'ws-'));
  const dotVscode = path.join(workspaceDir, '.vscode');
  fs.mkdirSync(dotVscode, { recursive: true });
  fs.writeFileSync(
    path.join(dotVscode, 'settings.json'),
    JSON.stringify({ 'tackle.defaultAgent': 'stub' }, null, 2),
  );
  fs.mkdirSync(path.join(workspaceDir, '.tackle'), { recursive: true });

  // The worktree provisioner (#10) needs the workspace to be a real git
  // repo. Use execFileSync (not execSync) so paths with spaces don't
  // hit shell-quoting bugs.
  const git = (...args: string[]): void => {
    cp.execFileSync('git', args, { cwd: workspaceDir, stdio: 'pipe' });
  };
  git('init', '-b', 'main');
  git('config', 'user.email', 'tackle-perf@example.com');
  git('config', 'user.name', 'Tackle Perf');
  git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# perf fixture\n');
  git('add', '.');
  git('commit', '-m', 'initial');

  const exitCode = await launchVsCodeSuite({
    suiteRelativeToOutTest,
    extraLaunchArgs: [workspaceDir],
    env: {
      TACKLE_PERF_SUITE_DIR: path.resolve(outTestRoot, suiteSubdir),
      TACKLE_PERF_OUTPUT: perfOutput,
      TACKLE_TEST_WORKSPACE: workspaceDir,
      TACKLE_TEST_PSMUX_PREFIX: psmuxPrefix,
      TACKLE_TEST_JSONL_DIR: jsonlDir,
      TACKLE_TEST_STUB_PATH: path.resolve(
        outTestRoot,
        '..',
        'test',
        'fixtures',
        'bin',
        'claude-stub.mjs',
      ),
      TACKLE_TEST_STUB_SCENARIO: process.env.TACKLE_TEST_STUB_SCENARIO ?? 'idle-working-idle',
    },
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
