import type { Database } from '../../db/database';
import type { EventBus, PlanApprovedEvent } from '../event-bus';
import { isLegalTackleTransition } from '../status-transition';
import type { TackleStatus } from '../../index';

/**
 * Handler for `plan.approved`. Sole writer of `tasks.tackle_status` for the
 * plan_awaiting_approval → plan_approved transition. Validates, mutates,
 * audits.
 */
export function registerPlanApprovedHandler(bus: EventBus, db: Database): void {
  bus.register('plan.approved', (event: PlanApprovedEvent) => {
    const row = db
      .prepare<{ tackle_status: TackleStatus }>('SELECT tackle_status FROM tasks WHERE id = ?')
      .get(event.task_id);
    if (!row) {
      throw new Error(`plan.approved: task ${event.task_id} not found`);
    }
    const from: TackleStatus = row.tackle_status;
    const to: TackleStatus = 'plan_approved';
    if (!isLegalTackleTransition(from, to)) {
      throw new Error(
        `plan.approved: illegal transition ${from} → ${to} for task ${event.task_id}`,
      );
    }
    db.prepare('UPDATE tasks SET tackle_status = ? WHERE id = ?').run(to, event.task_id);
    db.prepare('INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)').run(
      'plan.approved',
      JSON.stringify({ task_id: event.task_id, source: event.source, from, to }),
    );
  });
}
