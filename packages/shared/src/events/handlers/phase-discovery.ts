import type { Database } from '../../db/database';
import type { EventBus, PhaseCreatedEvent, PhaseRemovedEvent } from '../event-bus';

/**
 * `phase.created` handler. Inserts a new row into `phases` mirroring an
 * external child item that Plan Discovery just observed for the first time.
 * The handler is the sole writer of phase rows from Sync.
 */
export function registerPhaseCreatedHandler(bus: EventBus, db: Database): void {
  bus.register('phase.created', (event: PhaseCreatedEvent) => {
    db.prepare(
      `INSERT INTO phases (plan_id, task_id, external_id, name, sort_order, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
    ).run(event.plan_id, event.task_id, event.external_id, event.name, event.sort_order);
    db.prepare('INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)').run(
      'phase.created',
      JSON.stringify({
        task_id: event.task_id,
        plan_id: event.plan_id,
        external_id: event.external_id,
        name: event.name,
        sort_order: event.sort_order,
        source: event.source,
      }),
    );
  });
}

/**
 * `phase.removed` handler. Deletes a phase row whose external child was
 * removed from the parent Task on the tracker. Idempotent: if the row is
 * already gone, the handler returns `false` to suppress audit/refresh.
 */
export function registerPhaseRemovedHandler(bus: EventBus, db: Database): void {
  bus.register('phase.removed', (event: PhaseRemovedEvent) => {
    const result = db
      .prepare('DELETE FROM phases WHERE task_id = ? AND external_id = ?')
      .run(event.task_id, event.external_id);
    if (result.changes === 0) {
      return false;
    }
    db.prepare('INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)').run(
      'phase.removed',
      JSON.stringify({
        task_id: event.task_id,
        external_id: event.external_id,
        source: event.source,
      }),
    );
    return true;
  });
}
