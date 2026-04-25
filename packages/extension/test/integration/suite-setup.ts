import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Per-suite test fixture for integration tests (#66).
 *
 * Lifecycle (per Mocha file):
 *   - `before`: mkdtemp a fresh workspace under the runner-provided
 *     scratch root, set `TACKLE_TEST_WORKSPACE` + `TACKLE_TEST_DB`,
 *     write extension settings (`tackle.defaultAgent = 'stub'`),
 *     ensure VS Code has opened the workspace.
 *   - `beforeEach`: clear `.tackle/` so each test sees a clean DB.
 *   - `afterEach`: kill any lingering psmux sessions matching the
 *     `${PREFIX}*` pattern (set by run-integration.ts).
 *   - `after`: best-effort cleanup of the workspace dir.
 *
 * The harness model — single VS Code launch, multiple workspaces /
 * tests inside it — comes from ADR-0012's "real VS Code, fresh
 * fixtures per test" decision.
 */

export interface IntegrationContext {
  /** Per-suite workspace directory. Holds `.tackle/`, fixture DB, etc. */
  workspaceDir: string;
  /** Path to the `.tackle/` directory inside `workspaceDir`. */
  tackleDir: string;
  /** Path to the SQLite DB used by ModeManager (`TACKLE_TEST_DB`). */
  dbPath: string;
  /** psmux session-name prefix shared with `claude-stub` and PsmuxBridge. */
  psmuxPrefix: string;
  /** Directory the stub Agent writes synthetic jsonl into. */
  jsonlDir: string;
}

const ctx: { current: IntegrationContext | null } = { current: null };

/** Returns the active integration context. Throws when called outside a suite. */
export function getContext(): IntegrationContext {
  if (!ctx.current) throw new Error('integration context not initialized — call setupIntegrationSuite() first');
  return ctx.current;
}

/** Bounded poll. Resolves with `true` when `predicate()` becomes truthy, otherwise `false`. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5000);
  const intervalMs = opts.intervalMs ?? 50;
  // Run one immediate check so trivially-true predicates don't pay the interval cost.
  if (await predicate()) return true;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));
    if (await predicate()) return true;
  }
  return false;
}

function detectMuxBinary(): string | undefined {
  for (const cmd of ['psmux', 'tmux']) {
    try {
      cp.execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return cmd;
    } catch { /* try next */ }
  }
  return undefined;
}

/** Best-effort kill of every psmux session matching `${prefix}*`. Never throws. */
function killSessionsWithPrefix(prefix: string): void {
  const bin = detectMuxBinary();
  if (!bin) return;
  let raw = '';
  try {
    raw = cp.execSync(`${bin} list-sessions`, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return; // no server / no sessions
  }
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    const name = colonIdx >= 0 ? line.substring(0, colonIdx) : line.trim();
    if (!name.startsWith(prefix)) continue;
    try {
      cp.execSync(`${bin} kill-session -t "${name}"`, { encoding: 'utf-8', timeout: 5000, stdio: 'ignore' });
    } catch { /* ignore */ }
  }
}

function rmrf(p: string): void {
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
}

/**
 * Wires Mocha hooks for an integration suite. Each test file calls this
 * once at top level. Sets `process.env.TACKLE_TEST_WORKSPACE` +
 * `TACKLE_TEST_DB` so the extension's workspace-guard and mode-manager
 * pick up the fixture paths on each `tackle.activate`.
 */
export function setupIntegrationSuite(): void {
  const scratchRoot = process.env.TACKLE_TEST_SCRATCH_ROOT
    ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tackle-it-fallback-'));
  const psmuxPrefix = process.env.TACKLE_TEST_PSMUX_PREFIX ?? `tackleit-${process.pid}-`;
  const jsonlDir = process.env.TACKLE_TEST_JSONL_DIR ?? path.join(scratchRoot, 'jsonl');

  suiteSetup(async function () {
    this.timeout(30_000);
    // Use the workspace dir the runner pre-created and passed via launchArgs.
    // Mid-process transitions from no-folder to folder require a VS Code
    // restart, which would tear down the test host. Falling back to
    // mkdtemp would leave VS Code with no folders open.
    const workspaceDir = process.env.TACKLE_TEST_WORKSPACE
      ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      throw new Error('integration suite expects TACKLE_TEST_WORKSPACE to be set by run-integration.ts');
    }
    const tackleDir = path.join(workspaceDir, '.tackle');
    fs.mkdirSync(tackleDir, { recursive: true });
    const dbPath = path.join(tackleDir, 'tackle.db');

    // Re-assert env so a child process spawned by the extension (e.g.
    // the stub Agent via psmux send-keys) inherits the right paths.
    process.env.TACKLE_TEST_WORKSPACE = workspaceDir;
    process.env.TACKLE_TEST_DB = dbPath;
    process.env.TACKLE_TEST_JSONL_DIR = jsonlDir;
    process.env.TACKLE_TEST_PSMUX_PREFIX = psmuxPrefix;

    ctx.current = { workspaceDir, tackleDir, dbPath, psmuxPrefix, jsonlDir };

    // Wait for VS Code to finish loading the workspace folder.
    await waitFor(
      () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.toLowerCase() === workspaceDir.toLowerCase(),
      { timeoutMs: 10_000 },
    );
  });

  setup(function () {
    if (!ctx.current) return;
    // Wipe DB + jsonl between tests so each flow sees clean state.
    // The .tackle dir itself is preserved (the extension recreates files
    // on activate).
    for (const entry of fs.readdirSync(ctx.current.tackleDir)) {
      rmrf(path.join(ctx.current.tackleDir, entry));
    }
    if (fs.existsSync(ctx.current.jsonlDir)) {
      for (const entry of fs.readdirSync(ctx.current.jsonlDir)) {
        rmrf(path.join(ctx.current.jsonlDir, entry));
      }
    }
  });

  teardown(async function () {
    this.timeout(15_000);
    // Deactivate the extension so detectors / terminals release before
    // the next test re-activates with a fresh DB.
    try { await vscode.commands.executeCommand('tackle.deactivate'); } catch { /* ignore */ }
    killSessionsWithPrefix(psmuxPrefix);
  });

  suiteTeardown(function () {
    if (!ctx.current) return;
    killSessionsWithPrefix(psmuxPrefix);
    // Workspace dir is owned by the runner (it lives inside scratchRoot
    // and is wiped on process exit by the OS tmp lifecycle). Don't
    // delete it here — other suites in the same VS Code launch share it.
    ctx.current = null;
  });
}
