// Implement-action spawn helper (#81 wiring).
//
// Pure helper: given the Phases for a Task and the Task id, return the
// list of Phases for which an `implement` Session should be spawned, in
// sort_order. Only `pending` phases qualify — phases that are already
// in_progress, done, or failed are blocked or completed and must not be
// re-spawned.

import type { EventBus, Phase, PhaseRepository, PlanRepository } from '@tackle/shared';

export function phasesToImplement(phases: Phase[], taskId: number): Phase[] {
  return phases
    .filter((p) => p.task_id === taskId && p.status === 'pending')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export interface ImplementSpawnerDeps {
  plansRepo: Pick<PlanRepository, 'get'>;
  phasesRepo: Pick<PhaseRepository, 'listForPlan'>;
  /**
   * Spawn an `implement` Session for the given (taskId, phaseId). The
   * actual session creation goes through NewSessionFlow / TerminalOrchestrator
   * — this callback decouples the spawner from those collaborators so the
   * unit test can verify it was invoked once per pending phase.
   */
  spawn: (taskId: number, phaseId: number) => Promise<void>;
}

/**
 * Register a listener that, on every `task.implementation_started`,
 * spawns one `implement` Session per *pending* Phase. Phases already
 * in_progress, done, or failed are skipped — they're either in flight
 * elsewhere, complete, or blocked on user attention. Pure phase status
 * is used as the gate; future "blocked-by" semantics belong here too.
 */
export function registerImplementSpawner(bus: EventBus, deps: ImplementSpawnerDeps): void {
  bus.onMutation((event) => {
    if (event.type !== 'task.implementation_started') return;
    void run(event.task_id, deps);
  });
}

async function run(taskId: number, deps: ImplementSpawnerDeps): Promise<void> {
  let plan;
  try {
    plan = await deps.plansRepo.get(taskId);
  } catch {
    return;
  }
  if (!plan) return;

  let phases: Phase[];
  try {
    phases = await deps.phasesRepo.listForPlan(plan.id);
  } catch {
    return;
  }

  const pending = phasesToImplement(phases, taskId);
  for (const p of pending) {
    try {
      await deps.spawn(taskId, p.id);
    } catch {
      // One failed spawn shouldn't block sibling spawns.
    }
  }
}
