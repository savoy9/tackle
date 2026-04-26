import type { Database } from '../../db/database';
import type { EventBus, ExternalStatusChangedEvent } from '../event-bus';

/**
 * Handler for `external.status_changed`. Updates `tasks.external_status` to
 * mirror the external tracker's open/closed state. Idempotent: when the
 * incoming `to` already matches the local value, the handler returns `false`
 * to suppress audit-log writes and webview refresh.
 *
 * This is the path Sync uses to project external state changes into the
 * local DB. Direct repository writes to `external_status` are forbidden;
 * everything goes through this seam (PRD #72 user story 44).
 */
export function registerExternalStatusChangedHandler(bus: EventBus, db: Database): void {
  bus.register('external.status_changed', (event: ExternalStatusChangedEvent) => {
    const row = db
      .prepare<{ external_status: string }>('SELECT external_status FROM tasks WHERE id = ?')
      .get(event.task_id);
    if (!row) {
      throw new Error(`external.status_changed: task ${event.task_id} not found`);
    }
    const from = row.external_status;
    if (from === event.to) {
      // Idempotent no-op: nothing changed in the external tracker.
      return false;
    }
    db.prepare('UPDATE tasks SET external_status = ? WHERE id = ?').run(event.to, event.task_id);
    db.prepare('INSERT INTO events (session_id, event_type, payload) VALUES (NULL, ?, ?)').run(
      'external.status_changed',
      JSON.stringify({
        task_id: event.task_id,
        source: event.source,
        from,
        to: event.to,
      }),
    );
    return true;
  });
}
