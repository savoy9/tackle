import type { Database } from '../../db/database';
import type { EventBus, TaskPlanStartedEvent } from '../event-bus';
import { isLegalTackleTransition } from '../status-transition';
import type { TackleStatus } from '../../index';

/**
 * Handler for `task.plan_started`. Sole writer of `tasks.tackle_status` for
 * this transition. Validates the transition, mutates the row, writes an
 * audit row to `events`, and (via the bus's onRefresh listeners) signals
 * webview refresh.
 */
export function registerTaskPlanStartedHandler(bus: EventBus, db: Database): void {
  bus.register('task.plan_started', (event: TaskPlanStartedEvent) => {
    const row = db
      .prepare<{ tackle_status: TackleStatus }>('SELECT tackle_status FROM tasks WHERE id = ?')
      .get(event.task_id);
    if (!row) {
      throw new Error(`task.plan_started: task ${event.task_id} not found`);
    }
    const from: TackleStatus = row.tackle_status;
    const to: TackleStatus = 'plan_started';
    if (!isLegalTackleTransition(from, to)) {
      throw new Error(
        `task.plan_started: illegal transition ${from} → ${to} for task ${event.task_id}`,
      );
    }
    db.prepare('UPDATE tasks SET tackle_status = ? WHERE id = ?').run(to, event.task_id);
    db.prepare(
      'INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)',
    ).run('task.plan_started', JSON.stringify({
      task_id: event.task_id,
      source: event.source,
      from,
      to,
    }));

    // Create an empty plans row for the task if one doesn't exist yet. The
    // plans row is the anchor for Plan Source detection (#77) and Plan
    // Discovery (#76); creating it eagerly on plan_started means later
    // sync passes can attach source_kind/source_ref and emit phase events
    // without needing a separate "first sub-issue seen" trigger.
    db.prepare(
      "INSERT INTO plans (task_id, source_path) VALUES (?, '') ON CONFLICT(task_id) DO NOTHING",
    ).run(event.task_id);
  });
}
