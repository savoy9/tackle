/**
 * Perf scenarios — three world-shapes the timing harness measures, per
 * issue #68 + ADR-0012.
 *
 * Each scenario is an async function that:
 *   1. Seeds the Tackle DB with two tasks (Task A + Task B), except
 *      cold-start which seeds only Task B.
 *   2. Spawns the stub-Agent sessions described in the scenario shape.
 *   3. Returns a `{ taskAId?, taskBId }` handle the runner uses to fire
 *      the activate-task command and start the timing clock.
 *
 * Sessions all use the `stub` Agent registered in the perf workspace
 * settings — no test reaches Anthropic.
 *
 * The `tackle._perfSeedTask` and `tackle._perfSpawnSession` shims
 * referenced below are registered in `extension.ts` only when
 * `TACKLE_TEST_STUB_PATH` is set (the perf runner sets it). They are
 * thin wrappers over the public TaskRepository.upsert and
 * TerminalOrchestrator.createTerminal paths so the perf scenarios
 * exercise the same code as the user-facing `newSession` flow without
 * the QuickPick interactions.
 */
import * as vscode from 'vscode';

export interface ScenarioHandles {
  taskAId?: number;
  taskBId: number;
}

export type ScenarioName = 'baseline' | 'heavy-fanout' | 'cold-start';

export interface ScenarioFactory {
  name: ScenarioName;
  /**
   * Prepare the world. Returns the task ids the harness needs to fire
   * the activate-task command for. Idempotent across runs (the runner
   * may invoke this 5–8 times per scenario).
   */
  setup(): Promise<ScenarioHandles>;
}

/**
 * Shared helper: ensure Tackle is activated, then insert the requested
 * tasks via the public command surface, then create N sessions per task
 * with the given kinds.
 */
async function ensureTackleActivated(): Promise<void> {
  await vscode.commands.executeCommand('tackle.activate');
}

async function seedTask(title: string): Promise<number> {
  // For perf we want determinism, not GitHub. We poke the task repo
  // through the extension's perf shim. The shim is registered by
  // `extension.ts` only when `TACKLE_TEST_STUB_PATH` is set —
  // production builds never expose this command.
  const id = await vscode.commands.executeCommand<number>('tackle._perfSeedTask', title);
  if (typeof id !== 'number') {
    throw new Error(
      'tackle._perfSeedTask command is not registered — perf scenarios require the perf-test build.',
    );
  }
  return id;
}

async function spawnSession(taskId: number, kind: 'agent' | 'shell'): Promise<void> {
  await vscode.commands.executeCommand('tackle._perfSpawnSession', { taskId, kind });
}

export const baseline: ScenarioFactory = {
  name: 'baseline',
  async setup(): Promise<ScenarioHandles> {
    await ensureTackleActivated();
    const taskAId = await seedTask('perf-baseline-A');
    const taskBId = await seedTask('perf-baseline-B');
    await spawnSession(taskAId, 'agent');
    await spawnSession(taskBId, 'agent');
    return { taskAId, taskBId };
  },
};

export const heavyFanout: ScenarioFactory = {
  name: 'heavy-fanout',
  async setup(): Promise<ScenarioHandles> {
    await ensureTackleActivated();
    const taskAId = await seedTask('perf-heavy-A');
    const taskBId = await seedTask('perf-heavy-B');
    // Task A: 1 stub-Agent + 1 shell.
    await spawnSession(taskAId, 'agent');
    await spawnSession(taskAId, 'shell');
    // Task B: 3 stub-Agents.
    await spawnSession(taskBId, 'agent');
    await spawnSession(taskBId, 'agent');
    await spawnSession(taskBId, 'agent');
    return { taskAId, taskBId };
  },
};

export const coldStart: ScenarioFactory = {
  name: 'cold-start',
  async setup(): Promise<ScenarioHandles> {
    // No prior Task A — measures the path the detector lifecycle takes
    // when re-adopting sessions on first launch.
    await ensureTackleActivated();
    const taskBId = await seedTask('perf-cold-B');
    await spawnSession(taskBId, 'agent');
    return { taskBId };
  },
};

export const ALL_SCENARIOS: ScenarioFactory[] = [baseline, heavyFanout, coldStart];
