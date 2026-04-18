import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';

describe('database', () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  it('creates tasks and sessions tables on init', () => {
    db = createDatabase(':memory:');

    const tables = db
      .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('sessions');
  });

  it('tasks table has the expected columns', () => {
    db = createDatabase(':memory:');

    const columns = db.prepare<{ name: string }>('PRAGMA table_info(tasks)').all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('external_id');
    expect(colNames).toContain('external_system');
    expect(colNames).toContain('title');
    expect(colNames).toContain('description');
    expect(colNames).toContain('status');
    expect(colNames).toContain('assignee');
    expect(colNames).toContain('synced_at');
    expect(colNames).toContain('created_at');
  });

  it('sessions table has the expected columns', () => {
    db = createDatabase(':memory:');

    const columns = db.prepare<{ name: string }>('PRAGMA table_info(sessions)').all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('task_id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('status');
    expect(colNames).toContain('psmux_session');
    expect(colNames).toContain('started_at');
    expect(colNames).toContain('ended_at');
  });
});
