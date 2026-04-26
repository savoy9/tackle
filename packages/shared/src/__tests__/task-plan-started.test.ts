import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import { createEventBus } from '../events/event-bus';
import { registerTaskPlanStartedHandler } from '../events/handlers/task-plan-started';

let db: Database;
beforeEach(() => {
  db = createDatabase(':memory:');
  // Seed a task at not_started.
  db.prepare(
    "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'T')",
  ).run();
});
afterEach(() => db.close());

describe('task.plan_started handler', () => {
  it('mutates tasks.tackle_status from not_started to plan_started', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    const row = db
      .prepare<{ tackle_status: string }>('SELECT tackle_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.tackle_status).toBe('plan_started');
  });

  it('writes an audit row to events table', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    const events = db
      .prepare<{ event_type: string; payload: string }>(
        'SELECT event_type, payload FROM events ORDER BY id',
      )
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('task.plan_started');
    const payload = JSON.parse(events[0].payload);
    expect(payload).toMatchObject({
      task_id: 1,
      source: 'ui',
      from: 'not_started',
      to: 'plan_started',
    });
  });

  it('throws on illegal transition and does not mutate', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    // Move task already past not_started.
    db.prepare("UPDATE tasks SET tackle_status = 'plan_approved' WHERE id = 1").run();
    expect(() =>
      bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' }),
    ).toThrow();
    const row = db
      .prepare<{ tackle_status: string }>('SELECT tackle_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.tackle_status).toBe('plan_approved');
    const events = db.prepare<{ c: number }>('SELECT COUNT(*) AS c FROM events').get();
    expect(events?.c).toBe(0);
  });

  it('emits webview-refresh signal after a successful dispatch', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    const refresh = vi.fn();
    bus.onRefresh(refresh);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('creates an empty plans row for the task if none exists', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    const row = db
      .prepare<{ id: number; task_id: number; source_kind: string | null; source_ref: string | null }>(
        'SELECT id, task_id, source_kind, source_ref FROM plans WHERE task_id = 1',
      )
      .get();
    expect(row).toBeDefined();
    expect(row?.task_id).toBe(1);
    expect(row?.source_kind).toBeNull();
    expect(row?.source_ref).toBeNull();
  });

  it('does not duplicate the plans row if one already exists', () => {
    const bus = createEventBus();
    registerTaskPlanStartedHandler(bus, db);
    db.prepare(
      "INSERT INTO plans (task_id, source_path) VALUES (1, '')",
    ).run();
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    const count = db
      .prepare<{ c: number }>('SELECT COUNT(*) AS c FROM plans WHERE task_id = 1')
      .get();
    expect(count?.c).toBe(1);
  });
});
