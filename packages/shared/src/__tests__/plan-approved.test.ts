import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import { createEventBus } from '../events/event-bus';
import { registerPlanApprovedHandler } from '../events/handlers/plan-approved';

let db: Database;
beforeEach(() => {
  db = createDatabase(':memory:');
  db.prepare(
    "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'T')",
  ).run();
});
afterEach(() => db.close());

describe('plan.approved handler', () => {
  it('advances tackle_status from plan_awaiting_approval to plan_approved', () => {
    db.prepare("UPDATE tasks SET tackle_status = 'plan_awaiting_approval' WHERE id = 1").run();
    const bus = createEventBus();
    registerPlanApprovedHandler(bus, db);
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    const row = db
      .prepare<{ tackle_status: string }>('SELECT tackle_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.tackle_status).toBe('plan_approved');
  });
});
