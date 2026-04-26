/**
 * Perf suite — runs each scenario 5–8 times via the timing harness and
 * writes results as JSON to `packages/extension/perf-results.json`.
 *
 * Executed inside the VS Code extension host by `run-perf.ts`. Mocha
 * carries the orchestration; the assertions are loose (perf is
 * advisory, never gates merge — see ADR-0012).
 */
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { PsmuxBridge } from '@tackle/shared';
import { measureScenario } from '../perf/timing';
import { createVSCodeProvider } from '../perf/vscode-provider';
import { ALL_SCENARIOS, type ScenarioFactory } from '../perf/scenarios';

interface RunStats {
  count: number;
  min: number;
  max: number;
  mean: number;
}

interface ScenarioResult {
  scenario: string;
  runs: number;
  t_responsive: RunStats;
  t_visible: RunStats;
  raw: { t_responsive: number; t_visible: number }[];
}

interface PerfResultsFile {
  generatedAt: string;
  iterations: number;
  goalLineMs: 1000;
  goalLineNote: string;
  scenarios: ScenarioResult[];
}

const RUNS_PER_SCENARIO = 6; // within the 5–8 band per spec

/**
 * Per-iteration teardown. Without this, sessions accumulate across the
 * 6 iterations × N spawns until psmux refuses `new-session` (issue #83
 * symptom 2/3 — `Command failed: psmux new-session ...`). Mirrors the
 * `${prefix}*` cleanup loop in `integration/suite-setup.ts`.
 */
async function resetPerfWorld(): Promise<void> {
  // Deactivate releases detectors + orchestrator-owned terminals so the
  // next iteration's `tackle.activate` rebuilds from a clean slate.
  try {
    await vscode.commands.executeCommand('tackle.deactivate');
  } catch {
    /* ignore — deactivate is best-effort between iterations */
  }

  // Kill orphan psmux sessions matching the runner's prefix. Poll until
  // `listSessions()` reports the prefix as empty — psmux on Windows
  // sometimes lags after a `kill-session`, and the next iteration's
  // `new-session` will exit immediately if a same-named session is
  // still being torn down.
  const prefix = process.env.TACKLE_TEST_PSMUX_PREFIX;
  if (prefix) {
    const bridge = new PsmuxBridge();
    if (bridge.binary) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        let names: string[] = [];
        try {
          names = bridge.listSessions();
        } catch {
          break; // bridge transiently failed — give up cleanly
        }
        const matching = names.filter((n) => n.startsWith(prefix));
        if (matching.length === 0) break;
        for (const name of matching) {
          try {
            bridge.killSession(name);
          } catch {
            /* ignore — already-dead session */
          }
        }
        // Brief pause to let psmux process the kill before re-listing.
        await new Promise<void>((r) => setTimeout(r, 50));
      }
    }
  }

  // Wipe `.tackle/` so the next iteration re-seeds against a clean DB.
  const ws = process.env.TACKLE_TEST_WORKSPACE;
  if (ws) {
    const tackleDir = path.join(ws, '.tackle');
    if (fs.existsSync(tackleDir)) {
      for (const entry of fs.readdirSync(tackleDir)) {
        try {
          fs.rmSync(path.join(tackleDir, entry), {
            recursive: true,
            force: true,
            maxRetries: 3,
          });
        } catch {
          /* ignore */
        }
      }
    }

    // Worktrees + branches survive on disk across iterations and collide
    // with `git worktree add -b <branch>` on subsequent setups (the
    // provisioner's collision fallback isn't enough — both the slug
    // branch and `tackle/<id>` accumulate). Use `git worktree remove
    // --force` to drop git's worktree registration cleanly, then
    // delete the branches.
    let worktreePaths: string[] = [];
    try {
      const list = cp
        .execFileSync('git', ['worktree', 'list', '--porcelain'], {
          cwd: ws,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        .toString();
      worktreePaths = list
        .split(/\r?\n/)
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length).trim())
        // Skip the main worktree (workspace itself).
        .filter((p) => p && path.resolve(p) !== path.resolve(ws));
    } catch {
      /* ignore */
    }
    for (const wt of worktreePaths) {
      try {
        cp.execFileSync('git', ['worktree', 'remove', '--force', wt], {
          cwd: ws,
          stdio: 'pipe',
        });
      } catch {
        /* ignore — fall through to rmrf + prune */
      }
    }
    const repoName = path.basename(ws);
    const worktreesRoot = path.resolve(ws, '..', `${repoName}.worktrees`);
    if (fs.existsSync(worktreesRoot)) {
      try {
        fs.rmSync(worktreesRoot, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* ignore */
      }
    }
    try {
      cp.execFileSync('git', ['worktree', 'prune'], { cwd: ws, stdio: 'pipe' });
    } catch {
      /* ignore */
    }
    // Drop perf-* and tackle/perf-* branches the provisioner created.
    try {
      const branches = cp
        .execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
          cwd: ws,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        .toString()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((b) => b && b !== 'main' && (b.startsWith('perf-') || b.startsWith('tackle/perf-')));
      for (const b of branches) {
        try {
          cp.execFileSync('git', ['branch', '-D', b], { cwd: ws, stdio: 'pipe' });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
}

function statsOf(values: number[]): RunStats {
  if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { count: values.length, min, max, mean: sum / values.length };
}

async function runScenario(s: ScenarioFactory, runs: number): Promise<ScenarioResult> {
  const provider = createVSCodeProvider();
  const raw: { t_responsive: number; t_visible: number }[] = [];
  for (let i = 0; i < runs; i++) {
    // Reset between iterations so psmux sessions don't accumulate and
    // the DB / orchestrator state is fresh. First iteration also resets
    // because a previous scenario's sessions might still be live.
    await resetPerfWorld();
    // psmux on Windows occasionally fails the very first `new-session`
    // after a deactivate/activate cycle (the binary "exits immediately"
    // — see issue #83). Setup runs entirely before the timing clock
    // starts, so retrying is invisible to t_responsive / t_visible.
    // Use 5 attempts with progressive back-off (0.25s → 2s) so genuine
    // Windows process-table pressure has time to dissipate before we
    // give up and record a sentinel.
    const SETUP_ATTEMPTS = 5;
    let handles: Awaited<ReturnType<ScenarioFactory['setup']>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < SETUP_ATTEMPTS && handles === null; attempt++) {
      try {
        handles = await s.setup();
      } catch (err: unknown) {
        lastErr = err;
        // eslint-disable-next-line no-console
        console.warn(
          `[perf] ${s.name} iter ${i} setup attempt ${attempt + 1} failed: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        await resetPerfWorld();
        // 250ms, 500ms, 1000ms, 2000ms back-off.
        const backoffMs = 250 * 2 ** attempt;
        await new Promise<void>((r) => setTimeout(r, backoffMs));
      }
    }
    if (handles === null) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`scenario ${s.name} iter ${i} setup failed: ${String(lastErr)}`);
    }
    const m = await measureScenario({
      provider,
      setup: async () => {
        await vscode.commands.executeCommand('tackle.activateTask', handles!.taskBId);
      },
      quiesceMs: 100,
      timeoutMs: 30_000,
    });
    raw.push(m);
  }
  return {
    scenario: s.name,
    runs,
    t_responsive: statsOf(raw.map((r) => r.t_responsive)),
    t_visible: statsOf(raw.map((r) => r.t_visible)),
    raw,
  };
}

suite('perf', () => {
  test('measures three scenarios and writes perf-results.json', async function () {
    this.timeout(20 * 60_000);

    // Probe the command list before running scenarios. The shims must
    // be registered by `extension.ts` (gated on TACKLE_TEST_STUB_PATH);
    // a missing command means the runner didn't set the env var or
    // the build didn't include the test-only branch. Bail with sentinel
    // results in that case so the artifact + PR comment distinguishes
    // "perf regressed" from "perf never ran".
    const cmds = new Set(await vscode.commands.getCommands(true));
    const missing = ['tackle._perfSeedTask', 'tackle._perfSpawnSession'].filter(
      (c) => !cmds.has(c),
    );

    const results: ScenarioResult[] = [];
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[perf] skipping all scenarios: missing commands: ${missing.join(', ')}`);
      for (const s of ALL_SCENARIOS) {
        results.push({
          scenario: s.name,
          runs: 0,
          t_responsive: { count: 0, min: 0, max: 0, mean: 0 },
          t_visible: { count: 0, min: 0, max: 0, mean: 0 },
          raw: [],
        });
      }
    } else {
      for (const s of ALL_SCENARIOS) {
      try {
        const r = await runScenario(s, RUNS_PER_SCENARIO);
        for (const summary of [r.t_responsive, r.t_visible]) {
          assert.ok(summary.count === RUNS_PER_SCENARIO, `expected ${RUNS_PER_SCENARIO} runs`);
        }
        results.push(r);
        // eslint-disable-next-line no-console
        console.log(
          `[perf] ${s.name}: t_responsive mean=${r.t_responsive.mean.toFixed(0)}ms ` +
            `(min=${r.t_responsive.min.toFixed(0)}, max=${r.t_responsive.max.toFixed(0)}); ` +
            `t_visible mean=${r.t_visible.mean.toFixed(0)}ms`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(`[perf] scenario ${s.name} failed: ${msg}`);
        // Per ADR-0012 perf is advisory, so we don't fail the build —
        // but we DO record a sentinel so the comment publisher shows
        // the scenario was attempted.
        results.push({
          scenario: s.name,
          runs: 0,
          t_responsive: { count: 0, min: 0, max: 0, mean: 0 },
          t_visible: { count: 0, min: 0, max: 0, mean: 0 },
          raw: [],
        });
      }
      }
    }

    const out: PerfResultsFile = {
      generatedAt: new Date().toISOString(),
      iterations: RUNS_PER_SCENARIO,
      goalLineMs: 1000,
      goalLineNote:
        '1000 ms t_responsive is an INFORMATIONAL goal line (see ADR-0012). ' +
        'It is not a pass/fail criterion; perf is advisory and never gates merge.',
      scenarios: results,
    };

    // Resolve output path: <extension>/perf-results.json. The runner
    // sets TACKLE_PERF_OUTPUT for us; fall back to cwd if missing.
    const outPath = process.env.TACKLE_PERF_OUTPUT
      ?? path.resolve(process.cwd(), 'perf-results.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[perf] wrote ${outPath}`);
  });
});
