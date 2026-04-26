import type { Database } from '../../db/database';
import type { EventBus, TaskImplementationStartedEvent } from '../event-bus';
import { isLegalTackleTransition } from '../status-transition';
import type { TackleStatus } from '../../index';

/**
 * Handler for `task.implementation_started`. Sole writer of
 * `tasks.tackle_status` for the plan_approved → implementation_started
 * transition.
 */
export function registerTaskImplementationStartedHandler(bus: EventBus, db: Database): void {
  bus.register('task.implementation_started', (event: TaskImplementationStartedEvent) => {
    const row = db
      .prepare<{ tackle_status: TackleStatus }>('SELECT tackle_status FROM tasks WHERE id = ?')
      .get(event.task_id);
    if (!row) {
      throw new Error(`task.implementation_started: task ${event.task_id} not found`);
    }
    const from: TackleStatus = row.tackle_status;
    const to: TackleStatus = 'implementation_started';
    if (!isLegalTackleTransition(from, to)) {
      throw new Error(
        `task.implementation_started: illegal transition ${from} → ${to} for task ${event.task_id}`,
      );
    }
    db.prepare('UPDATE tasks SET tackle_status = ? WHERE id = ?').run(to, event.task_id);
    db.prepare('INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)').run(
      'task.implementation_started',
      JSON.stringify({ task_id: event.task_id, source: event.source, from, to }),
    );
  });
}
