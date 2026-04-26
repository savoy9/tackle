import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, openDatabase } from '../db/database';
import type { Database } from '../db/database';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    expect(tables).toEqual([
      'events',
      'layout_states',
      'phases',
      'plans',
      'sessions',
      'summaries',
      'tasks',
    ]);
  });

  it('tasks table has worktree columns', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('tasks')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('worktree_path');
    expect(cols).toContain('worktree_branch');
    expect(cols).toContain('worktree_base_branch');
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

  it('sessions.agent_state defaults to idle on insert', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('sessions')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('agent_state');

    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 'test')",
    ).run();
    db.prepare(
      "INSERT INTO sessions (task_id, name, kind, psmux_name) VALUES (1, 's', 'implement', 'p')",
    ).run();
    const row = db
      .prepare<{ agent_state: string }>("SELECT agent_state FROM sessions WHERE name = 's'")
      .get();
    expect(row?.agent_state).toBe('idle');
  });

  it('tasks.external_status is the canonical column (renamed from status)', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('tasks')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('external_status');
    expect(cols).not.toContain('status');

    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title, external_status) VALUES ('1', 'github', 't', 'closed')",
    ).run();
    const row = db
      .prepare<{ external_status: string }>('SELECT external_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.external_status).toBe('closed');
  });

  it('phases table has external_id column for sub-issue identity', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('phases')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('external_id');

    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 't')",
    ).run();
    db.prepare("INSERT INTO plans (task_id, source_path) VALUES (1, '')").run();
    db.prepare(
      "INSERT INTO phases (plan_id, task_id, external_id, name) VALUES (1, 1, '101', 'P1')",
    ).run();
    const row = db
      .prepare<{ external_id: string }>('SELECT external_id FROM phases WHERE id = 1')
      .get();
    expect(row?.external_id).toBe('101');
  });

  it('plans table has source_kind and source_ref columns', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('plans')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('source_kind');
    expect(cols).toContain('source_ref');

    // Insert a task and a plan; round-trip the source columns.
    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('42', 'github', 't')",
    ).run();
    db.prepare(
      "INSERT INTO plans (task_id, source_path, source_kind, source_ref) VALUES (1, '', 'markdown', 'plans/42-foo.md')",
    ).run();
    const row = db
      .prepare<{ source_kind: string; source_ref: string }>(
        'SELECT source_kind, source_ref FROM plans WHERE id = 1',
      )
      .get();
    expect(row?.source_kind).toBe('markdown');
    expect(row?.source_ref).toBe('plans/42-foo.md');
  });

  it('plans.source_kind CHECK rejects invalid values', () => {
    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 't')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO plans (task_id, source_path, source_kind) VALUES (1, '', 'bogus')",
        )
        .run(),
    ).toThrow();
  });

  it('tasks.tackle_status defaults to not_started and rejects invalid values', () => {
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info('tasks')")
      .all()
      .map((r) => r.name);
    expect(cols).toContain('tackle_status');

    db.prepare(
      "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 't')",
    ).run();
    const row = db
      .prepare<{ tackle_status: string }>('SELECT tackle_status FROM tasks WHERE id = 1')
      .get();
    expect(row?.tackle_status).toBe('not_started');

    expect(() =>
      db
        .prepare(
          "INSERT INTO tasks (external_id, external_system, title, tackle_status) VALUES ('2', 'github', 't2', 'bogus')",
        )
        .run(),
    ).toThrow();

    const valid = [
      'not_started',
      'plan_started',
      'plan_awaiting_approval',
      'plan_approved',
      'implementation_started',
      'in_review',
      'pr_created',
      'merged',
    ];
    for (const [i, v] of valid.entries()) {
      expect(() =>
        db
          .prepare(
            'INSERT INTO tasks (external_id, external_system, title, tackle_status) VALUES (?, ?, ?, ?)',
          )
          .run(`v${i}`, 'github', `tv${i}`, v),
      ).not.toThrow();
    }
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
          .prepare('INSERT INTO sessions (task_id, name, kind, psmux_name) VALUES (1, ?, ?, ?)')
          .run(`${kind}-s`, kind, `psmux-${kind}`),
      ).not.toThrow();
    }
    const sessions = db.prepare<{ kind: string }>('SELECT kind FROM sessions').all();
    expect(sessions.map((s) => s.kind).sort()).toEqual([...kinds].sort());
  });

  it('migration: legacy `status` column is renamed to `external_status`, values preserved', () => {
    // Build a legacy DB by hand (the schema as it was BEFORE the rename) and
    // then run the migration via createDatabase() over the same file.
    const tmp = mkdtempSync(join(tmpdir(), 'tackle-migrate-'));
    const file = join(tmp, 'legacy.db');
    try {
      const legacy = openDatabase(file);
      legacy.exec(`CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL,
        external_system TEXT NOT NULL CHECK(external_system IN ('github','ado')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      legacy
        .prepare(
          "INSERT INTO tasks (external_id, external_system, title, status) VALUES ('99', 'github', 'legacy', 'closed')",
        )
        .run();
      legacy.close();

      const migrated = createDatabase(file);
      const cols = migrated
        .prepare<{ name: string }>("PRAGMA table_info('tasks')")
        .all()
        .map((r) => r.name);
      expect(cols).toContain('external_status');
      expect(cols).not.toContain('status');

      const row = migrated
        .prepare<{ external_status: string; title: string }>(
          "SELECT external_status, title FROM tasks WHERE external_id = '99'",
        )
        .get();
      expect(row?.external_status).toBe('closed');
      expect(row?.title).toBe('legacy');
      migrated.close();
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        // Windows occasionally holds the SQLite WAL/SHM files briefly after
        // close; the OS will reap the temp dir later.
      }
    }
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
      external_status: 'open',
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
      external_status: 'closed',
      assignee: 'bob',
    });

    tasks = await repo.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Updated task');
    // upsert intentionally does NOT overwrite external_status on conflict;
    // the Event Bus is the sole writer of that column. The initial 'open'
    // is preserved here even though we passed 'closed'.
    expect(tasks[0].external_status).toBe('open');

    const task = await repo.get(tasks[0].id);
    expect(task).toBeDefined();
    expect(task!.assignee).toBe('bob');
  });

  it('upsertBatch inserts multiple', async () => {
    const repo = new SqliteTaskRepository(db);
    await repo.upsertBatch([
      {
        external_id: '1',
        external_system: 'github',
        title: 'A',
        description: '',
        external_status: 'open',
        assignee: null,
      },
      {
        external_id: '2',
        external_system: 'github',
        title: 'B',
        description: '',
        external_status: 'open',
        assignee: null,
      },
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
      external_status: 'open',
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
      terminal_placements: [
        { session_id: 1, group_index: 0 },
        { session_id: 2, group_index: 1 },
      ],
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

describe('Session migrations fields', () => {
  it('round-trips non-null prior_claude_session_ids JSON array', async () => {
    const taskRepo = new SqliteTaskRepository(db);
    await taskRepo.upsert({
      external_id: 'GH-1',
      external_system: 'github',
      title: 'Task',
      description: '',
      external_status: 'open',
      assignee: null,
    });
    const tasks = await taskRepo.list();
    const taskId = tasks[0].id;

    const repo = new SqliteSessionRepository(db);
    const created = await repo.create({
      task_id: taskId,
      phase_id: null,
      name: 'impl-1',
      kind: 'implement',
      psmux_name: 'psmux-1',
      prior_claude_session_ids: ['abc-123', 'def-456'],
    });
    expect(created.prior_claude_session_ids).toEqual(['abc-123', 'def-456']);

    const fetched = await repo.get(created.id);
    expect(fetched!.prior_claude_session_ids).toEqual(['abc-123', 'def-456']);
    expect(fetched!.agent_state).toBe('idle');
  });

  it('round-trips non-null Task.parent_external_id', async () => {
    const repo = new SqliteTaskRepository(db);
    await repo.upsert({
      external_id: 'GH-5',
      external_system: 'github',
      title: 'Child task',
      description: '',
      external_status: 'open',
      assignee: null,
      parent_external_id: 'ADO-100',
    });
    const tasks = await repo.list();
    expect(tasks[0].parent_external_id).toBe('ADO-100');
    const one = await repo.get(tasks[0].id);
    expect(one!.parent_external_id).toBe('ADO-100');
  });

  it('TaskRepository.setWorktree persists worktree fields', async () => {
    const repo = new SqliteTaskRepository(db);
    await repo.upsert({
      external_id: 'GH-7',
      external_system: 'github',
      title: 'Worktree task',
      description: '',
      external_status: 'open',
      assignee: null,
    });
    const tasks = await repo.list();
    const id = tasks[0].id;

    await repo.setWorktree(id, {
      worktree_path: '/wt/7-foo',
      worktree_branch: '7-foo',
      worktree_base_branch: 'main',
    });

    const updated = await repo.get(id);
    expect(updated!.worktree_path).toBe('/wt/7-foo');
    expect(updated!.worktree_branch).toBe('7-foo');
    expect(updated!.worktree_base_branch).toBe('main');
  });
});

describe('Migration of pre-existing DB', () => {
  it('opens an older DB file and gains missing columns without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tackle-mig-'));
    const file = join(dir, 'old.db');
    try {
      // Create a legacy schema (without agent_state / prior_claude_session_ids / parent_external_id)
      const legacy = openDatabase(file);
      legacy.exec(`
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          external_id TEXT NOT NULL,
          external_system TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          assignee TEXT,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX idx_tasks_external ON tasks(external_system, external_id);
        CREATE TABLE sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER,
          phase_id INTEGER,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'implement',
          status TEXT NOT NULL DEFAULT 'running',
          psmux_name TEXT NOT NULL,
          tab_label TEXT NOT NULL DEFAULT '',
          agent TEXT,
          worktree_path TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          claude_session_id TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT
        );
      `);
      legacy
        .prepare(
          "INSERT INTO tasks (external_id, external_system, title) VALUES ('1', 'github', 't')",
        )
        .run();
      legacy
        .prepare(
          "INSERT INTO sessions (task_id, name, kind, psmux_name) VALUES (1, 'old', 'implement', 'p')",
        )
        .run();
      legacy.close();

      // Reopen via createDatabase - migration runs; must not throw
      const upgraded = createDatabase(file);
      const sessCols = upgraded
        .prepare<{ name: string }>("PRAGMA table_info('sessions')")
        .all()
        .map((c) => c.name);
      expect(sessCols).toContain('agent_state');
      expect(sessCols).toContain('prior_claude_session_ids');
      const taskCols = upgraded
        .prepare<{ name: string }>("PRAGMA table_info('tasks')")
        .all()
        .map((c) => c.name);
      expect(taskCols).toContain('parent_external_id');

      // Existing legacy session's agent_state should default to 'idle'
      const row = upgraded
        .prepare<{ agent_state: string }>("SELECT agent_state FROM sessions WHERE name = 'old'")
        .get();
      expect(row?.agent_state).toBe('idle');
      upgraded.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* windows file lock tolerance */
      }
    }
  });
});
