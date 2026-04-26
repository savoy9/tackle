// Label Projector (#80 wiring).
//
// Mirrors local Tackle Status onto the GitHub label set. Listens on the
// Event Bus's onMutation hook for any successful (non-no-op) status
// dispatch, looks up the task's external id, fetches the issue's current
// labels, computes the projection (canonical tackle:* label added, stale
// tackle:* labels removed), and PATCHes the issue if anything changed.
//
// `phase.*` events do not mutate the parent task's tackle_status, so they
// are filtered out — only events whose handler updates `tasks.tackle_status`
// produce a label projection.
//
// HTTP IO is injected via fetchLabels / setLabels for testability.

import {
  computeLabelProjection,
  type EventBus,
  type Task,
  type TackleEvent,
  type TaskRepository,
} from '@tackle/shared';

const STATUS_MUTATING_EVENTS: ReadonlySet<TackleEvent['type']> = new Set([
  'task.plan_started',
  'plan.approved',
  'task.implementation_started',
  // external.status_changed mutates `external_status`, not `tackle_status`,
  // so it is intentionally excluded — labels project the local Tackle
  // status, not the GH state.
]);

export interface LabelProjectorDeps {
  taskRepo: Pick<TaskRepository, 'get'>;
  fetchLabels: (externalId: string) => Promise<string[]>;
  setLabels: (externalId: string, labels: string[]) => Promise<void>;
}

export function registerLabelProjector(bus: EventBus, deps: LabelProjectorDeps): void {
  bus.onMutation((event) => {
    if (!STATUS_MUTATING_EVENTS.has(event.type)) return;
    if (!('task_id' in event)) return;
    void project(event.task_id, deps);
  });
}

async function project(taskId: number, deps: LabelProjectorDeps): Promise<void> {
  let task: Task | undefined;
  try {
    task = await deps.taskRepo.get(taskId);
  } catch (err) {
    console.warn('[label-projector] taskRepo.get failed', err);
    return;
  }
  if (!task) return;

  let currentLabels: string[];
  try {
    currentLabels = await deps.fetchLabels(task.external_id);
  } catch (err) {
    console.warn('[label-projector] fetchLabels failed', err);
    return;
  }

  const projection = computeLabelProjection({
    currentLabels,
    target: task.tackle_status,
  });

  if (projection.add.length === 0 && projection.remove.length === 0) return;

  const removeSet = new Set(projection.remove);
  const next = currentLabels.filter((l) => !removeSet.has(l)).concat(projection.add);

  try {
    await deps.setLabels(task.external_id, next);
  } catch (err) {
    // Network failure must not break the local mutation — next mutation
    // (or a manual sync) will retry.
    console.warn('[label-projector] setLabels failed', err);
  }
}
