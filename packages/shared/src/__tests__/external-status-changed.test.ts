import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import { createEventBus } from '../events/event-bus';
import { registerExternalStatusChangedHandler } from '../events/handlers/external-status-changed';

let db: Database;
beforeEach(() => {
  db = createDatabase(':memory:');
  db.prepare(
    "INSERT INTO tasks (external_id, external_system, title, external_status) VALUES ('1', 'github', 'T', 'open')",
  ).run();
});
afterEach(() => db.close());

describe('external.status_changed handler', () => {
  it('updates tasks.external_status when value differs', () => {
    const bus = createEventBus();
    registerExternalStatusChangedHandler(bus, db);
    bus.dispatch({
      type: 'external.status_changed',
      task_id: 1,
      to: 'closed',
      source: 'sync',
    });
    const row = db
      .prepare<{ external_status: string }>('SELECT external_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.external_status).toBe('closed');
  });

  it('writes an audit row to events with from/to', () => {
    const bus = createEventBus();
    registerExternalStatusChangedHandler(bus, db);
    bus.dispatch({
      type: 'external.status_changed',
      task_id: 1,
      to: 'closed',
      source: 'sync',
    });
    const events = db
      .prepare<{
        event_type: string;
        payload: string;
      }>('SELECT event_type, payload FROM events ORDER BY id')
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('external.status_changed');
    expect(JSON.parse(events[0].payload)).toMatchObject({
      task_id: 1,
      source: 'sync',
      from: 'open',
      to: 'closed',
    });
  });

  it('is idempotent: no-op (no mutation, no audit row) when local already matches', () => {
    const bus = createEventBus();
    registerExternalStatusChangedHandler(bus, db);
    bus.dispatch({
      type: 'external.status_changed',
      task_id: 1,
      to: 'open',
      source: 'sync',
    });
    const audit = db.prepare<{ c: number }>('SELECT COUNT(*) AS c FROM events').get();
    expect(audit?.c).toBe(0);
  });

  it('emits webview-refresh signal only when state actually changed', () => {
    const bus = createEventBus();
    registerExternalStatusChangedHandler(bus, db);
    const refresh = vi.fn();
    bus.onRefresh(refresh);

    // Same value → no-op → no refresh.
    bus.dispatch({
      type: 'external.status_changed',
      task_id: 1,
      to: 'open',
      source: 'sync',
    });
    expect(refresh).toHaveBeenCalledTimes(0);

    // Different value → mutation → refresh.
    bus.dispatch({
      type: 'external.status_changed',
      task_id: 1,
      to: 'closed',
      source: 'sync',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('throws when the task does not exist', () => {
    const bus = createEventBus();
    registerExternalStatusChangedHandler(bus, db);
    expect(() =>
      bus.dispatch({
        type: 'external.status_changed',
        task_id: 999,
        to: 'closed',
        source: 'sync',
      }),
    ).toThrow();
  });
});
