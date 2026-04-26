import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import { createEventBus } from '../events/event-bus';
import {
  registerPhaseCreatedHandler,
  registerPhaseRemovedHandler,
} from '../events/handlers/phase-discovery';

let db: Database;
beforeEach(() => {
  db = createDatabase(':memory:');
  // Seed a Task and a Plan that Phases hang off of.
  db.prepare(
    "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'T')",
  ).run();
  db.prepare(
    "INSERT INTO plans (task_id, source_path, source_kind, source_ref) VALUES (1, '', 'markdown', 'plans/1-foo.md')",
  ).run();
});
afterEach(() => db.close());

describe('phase.created handler', () => {
  it('inserts a phase row with the supplied fields', () => {
    const bus = createEventBus();
    registerPhaseCreatedHandler(bus, db);
    bus.dispatch({
      type: 'phase.created',
      task_id: 1,
      plan_id: 1,
      external_id: '101',
      name: 'Phase A',
      sort_order: 0,
      source: 'sync',
    });
    const row = db
      .prepare<{ name: string; external_id: string; sort_order: number; status: string }>(
        'SELECT name, external_id, sort_order, status FROM phases WHERE plan_id = 1',
      )
      .get();
    expect(row).toMatchObject({
      name: 'Phase A',
      external_id: '101',
      sort_order: 0,
      status: 'pending',
    });
  });

  it('writes an audit row to events', () => {
    const bus = createEventBus();
    registerPhaseCreatedHandler(bus, db);
    bus.dispatch({
      type: 'phase.created',
      task_id: 1,
      plan_id: 1,
      external_id: '101',
      name: 'Phase A',
      sort_order: 0,
      source: 'sync',
    });
    const events = db
      .prepare<{ event_type: string; payload: string }>('SELECT event_type, payload FROM events')
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('phase.created');
    expect(JSON.parse(events[0].payload)).toMatchObject({
      task_id: 1,
      plan_id: 1,
      external_id: '101',
      source: 'sync',
    });
  });

  it('emits webview-refresh signal on insert', () => {
    const bus = createEventBus();
    registerPhaseCreatedHandler(bus, db);
    const refresh = vi.fn();
    bus.onRefresh(refresh);
    bus.dispatch({
      type: 'phase.created',
      task_id: 1,
      plan_id: 1,
      external_id: '101',
      name: 'Phase A',
      sort_order: 0,
      source: 'sync',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('phase.removed handler', () => {
  it('deletes the phase row by external_id', () => {
    db.prepare(
      "INSERT INTO phases (plan_id, task_id, external_id, name) VALUES (1, 1, '101', 'gone')",
    ).run();
    const bus = createEventBus();
    registerPhaseRemovedHandler(bus, db);
    bus.dispatch({
      type: 'phase.removed',
      task_id: 1,
      external_id: '101',
      source: 'sync',
    });
    const remaining = db.prepare<{ c: number }>('SELECT COUNT(*) AS c FROM phases').get();
    expect(remaining?.c).toBe(0);
  });

  it('writes audit row and emits refresh on removal', () => {
    db.prepare(
      "INSERT INTO phases (plan_id, task_id, external_id, name) VALUES (1, 1, '101', 'gone')",
    ).run();
    const bus = createEventBus();
    registerPhaseRemovedHandler(bus, db);
    const refresh = vi.fn();
    bus.onRefresh(refresh);
    bus.dispatch({
      type: 'phase.removed',
      task_id: 1,
      external_id: '101',
      source: 'sync',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    const ev = db
      .prepare<{ event_type: string }>('SELECT event_type FROM events')
      .get();
    expect(ev?.event_type).toBe('phase.removed');
  });

  it('is a no-op (no refresh, no audit) when the phase does not exist', () => {
    const bus = createEventBus();
    registerPhaseRemovedHandler(bus, db);
    const refresh = vi.fn();
    bus.onRefresh(refresh);
    bus.dispatch({
      type: 'phase.removed',
      task_id: 1,
      external_id: '999',
      source: 'sync',
    });
    expect(refresh).toHaveBeenCalledTimes(0);
    const audit = db.prepare<{ c: number }>('SELECT COUNT(*) AS c FROM events').get();
    expect(audit?.c).toBe(0);
  });
});
