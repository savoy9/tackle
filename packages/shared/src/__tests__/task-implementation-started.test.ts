import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import { createEventBus } from '../events/event-bus';
import { registerTaskImplementationStartedHandler } from '../events/handlers/task-implementation-started';

let db: Database;
beforeEach(() => {
  db = createDatabase(':memory:');
  db.prepare(
    "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'T')",
  ).run();
});
afterEach(() => db.close());

describe('task.implementation_started handler', () => {
  it('advances tackle_status from plan_approved to implementation_started', () => {
    db.prepare("UPDATE tasks SET tackle_status = 'plan_approved' WHERE id = 1").run();
    const bus = createEventBus();
    registerTaskImplementationStartedHandler(bus, db);
    bus.dispatch({ type: 'task.implementation_started', task_id: 1, source: 'ui' });
    const row = db
      .prepare<{ tackle_status: string }>('SELECT tackle_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.tackle_status).toBe('implementation_started');
  });

  it('rejects illegal transition (e.g., from not_started)', () => {
    const bus = createEventBus();
    registerTaskImplementationStartedHandler(bus, db);
    expect(() =>
      bus.dispatch({ type: 'task.implementation_started', task_id: 1, source: 'ui' }),
    ).toThrow();
  });
});
