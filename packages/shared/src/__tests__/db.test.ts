import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/database';
import type { Database } from '../db/database';
import {
  SqliteTaskRepository,
  SqliteSessionRepository,
  SqliteLayoutStateRepository,
} from '../db/sqlite-repositories';
import type { LayoutState } from '../index';

let db: Database;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('Database schema', () => {
  it('creates all tables', () => {
    const tables = db
      .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(['events', 'layout_states', 'phases', 'plans', 'sessions', 'summaries', 'tasks']);
  });

  it('sessions table has new columns', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('sessions')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('psmux_name');
    expect(cols).toContain('tab_label');
    expect(cols).toContain('agent');
    expect(cols).toContain('worktree_path');
    expect(cols).toContain('sort_order');
    expect(cols).toContain('claude_session_id');
  });

  it('sessions kind CHECK allows all 7 values', () => {
    // Insert a task first for FK
    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'test')",
    ).run();
    const kinds = ['plan', 'implement', 'review', 'debug', 'test', 'pilot', 'shell'] as const;
    for (const kind of kinds) {
      expect(() =>
        db
          .prepare(
            "INSERT INTO sessions (task_id, name, kind, psmux_name) VALUES (1, ?, ?, ?)",
          )
          .run(`${kind}-s`, kind, `psmux-${kind}`),
      ).not.toThrow();
    }
    const sessions = db.prepare<{ kind: string }>('SELECT kind FROM sessions').all();
    expect(sessions.map((s) => s.kind).sort()).toEqual([...kinds].sort());
  });
});

describe('TaskRepository', () => {
  it('CRUD with upsert', async () => {
    const repo = new SqliteTaskRepository(db);

    await repo.upsert({
      external_id: 'GH-1',
      external_system: 'github',
      title: 'First task',
      description: 'desc',
      status: 'open',
      assignee: null,
    });

    let tasks = await repo.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('First task');

    // Upsert updates
    await repo.upsert({
      external_id: 'GH-1',
      external_system: 'github',
      title: 'Updated task',
      description: 'desc2',
      status: 'closed',
      assignee: 'bob',
    });

    tasks = await repo.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Updated task');
    expect(tasks[0].status).toBe('closed');

    const task = await repo.get(tasks[0].id);
    expect(task).toBeDefined();
    expect(task!.assignee).toBe('bob');
  });

  it('upsertBatch inserts multiple', async () => {
    const repo = new SqliteTaskRepository(db);
    await repo.upsertBatch([
      { external_id: '1', external_system: 'github', title: 'A', description: '', status: 'open', assignee: null },
      { external_id: '2', external_system: 'github', title: 'B', description: '', status: 'open', assignee: null },
    ]);
    const tasks = await repo.list();
    expect(tasks).toHaveLength(2);
  });
});

describe('SessionRepository', () => {
  it('CRUD including listForTask', async () => {
    const taskRepo = new SqliteTaskRepository(db);
    await taskRepo.upsert({
      external_id: 'GH-1',
      external_system: 'github',
      title: 'Task',
      description: '',
      status: 'open',
      assignee: null,
    });
    const tasks = await taskRepo.list();
    const taskId = tasks[0].id;

    const repo = new SqliteSessionRepository(db);
    const session = await repo.create({
      task_id: taskId,
      phase_id: null,
      name: 'impl-1',
      kind: 'implement',
      psmux_name: 'psmux-impl-1',
      tab_label: 'Impl 1',
      agent: 'claude',
    });

    expect(session.id).toBeGreaterThan(0);
    expect(session.kind).toBe('implement');
    expect(session.status).toBe('running');

    const fetched = await repo.get(session.id);
    expect(fetched).toBeDefined();
    expect(fetched!.agent).toBe('claude');

    // Create another session for a different task (none)
    await repo.create({
      task_id: null,
      phase_id: null,
      name: 'shell-1',
      kind: 'shell',
      psmux_name: 'psmux-shell-1',
    });

    const forTask = await repo.listForTask(taskId);
    expect(forTask).toHaveLength(1);
    expect(forTask[0].name).toBe('impl-1');

    // Complete
    await repo.complete(session.id);
    const completed = await repo.get(session.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.ended_at).not.toBeNull();
  });
});

describe('LayoutStateRepository', () => {
  it('save/load JSON round-trip', async () => {
    const repo = new SqliteLayoutStateRepository(db);

    const state: LayoutState = {
      task_id: '42',
      editor_layout: { orientation: 0, groups: [{ size: 0.65 }, { size: 0.35 }] },
      terminal_placements: [{ session_id: 1, group_index: 0 }, { session_id: 2, group_index: 1 }],
      review_files: ['file:///readme.md', 'file:///src/index.ts'],
      focused_session_id: '1',
      focused_group_index: 0,
    };

    await repo.save(state);
    const loaded = await repo.get('42');
    expect(loaded).toBeDefined();
    expect(loaded).toEqual(state);

    // Verify not found
    const missing = await repo.get('999');
    expect(missing).toBeUndefined();
  });
});
