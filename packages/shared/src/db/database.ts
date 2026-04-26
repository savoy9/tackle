// Thin SQLite abstraction that works with bun:sqlite (Bun runtime),
// node:sqlite (Node 22.5+), and better-sqlite3 (older Node/Electron).

export interface Database {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): Statement<T>;
  close(): void;
}

export interface Statement<T = unknown> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export function openDatabase(dbPath: string): Database {
  // Try bun:sqlite first (available when running under Bun)
  try {
    const { Database: BunDB } = require('bun:sqlite');
    const db = new BunDB(dbPath);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    return {
      exec: (sql: string) => db.run(sql),
      prepare: <T>(sql: string) => {
        const stmt = db.prepare(sql);
        return {
          all: (...params: unknown[]) => stmt.all(...params) as T[],
          get: (...params: unknown[]) => (stmt.get(...params) ?? undefined) as T | undefined,
          run: (...params: unknown[]) => {
            const result = stmt.run(...params);
            return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid ?? 0 };
          },
        } as Statement<T>;
      },
      close: () => db.close(),
    };
  } catch {
    // not running under Bun
  }

  // Try node:sqlite (Node 22.5+ with --experimental-sqlite, Node 23+)
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    return {
      exec: (sql: string) => db.exec(sql),
      prepare: <T>(sql: string) => {
        const stmt = db.prepare(sql);
        return {
          all: (...params: unknown[]) => stmt.all(...params) as T[],
          get: (...params: unknown[]) => (stmt.get(...params) ?? undefined) as T | undefined,
          run: (...params: unknown[]) => {
            const result = stmt.run(...params);
            return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid ?? 0 };
          },
        } as Statement<T>;
      },
      close: () => db.close(),
    };
  } catch {
    // node:sqlite not available
  }

  // Fall back to better-sqlite3 (older Node/Electron)
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: <T>(sql: string) => {
      const stmt = db.prepare(sql);
      return {
        all: (...params: unknown[]) => stmt.all(...params) as T[],
        get: (...params: unknown[]) => stmt.get(...params) as T | undefined,
        run: (...params: unknown[]) => stmt.run(...params),
      } as Statement<T>;
    },
    close: () => db.close(),
  };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    external_system TEXT NOT NULL CHECK(external_system IN ('github', 'ado')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    assignee TEXT,
    parent_external_id TEXT,
    worktree_path TEXT,
    worktree_branch TEXT,
    worktree_base_branch TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
    ON tasks(external_system, external_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    phase_id INTEGER REFERENCES phases(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'implement' CHECK(kind IN ('plan','implement','review','debug','test','pilot','shell')),
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'stopped')),
    psmux_name TEXT NOT NULL,
    tab_label TEXT NOT NULL DEFAULT '',
    agent TEXT,
    worktree_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    claude_session_id TEXT,
    agent_state TEXT NOT NULL DEFAULT 'idle' CHECK(agent_state IN ('idle','working','waiting')),
    prior_claude_session_ids TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    source_path TEXT NOT NULL,
    extracted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_task
    ON plans(task_id);

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done', 'failed')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS layout_states (
    task_id TEXT PRIMARY KEY,
    editor_layout TEXT NOT NULL DEFAULT '{}',
    terminal_placements TEXT NOT NULL DEFAULT '[]',
    review_files TEXT NOT NULL DEFAULT '[]',
    focused_session_id TEXT,
    focused_group_index INTEGER
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function migrate(db: Database): void {
  // Idempotent additive migrations for older DB files.
  function columnExists(table: string, column: string): boolean {
    const rows = db.prepare<{ name: string }>(`PRAGMA table_info('${table}')`).all();
    return rows.some((r) => r.name === column);
  }
  function tableExists(table: string): boolean {
    const row = db
      .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);
    return !!row;
  }
  if (tableExists('sessions')) {
    if (!columnExists('sessions', 'agent_state')) {
      db.exec("ALTER TABLE sessions ADD COLUMN agent_state TEXT NOT NULL DEFAULT 'idle'");
    }
    if (!columnExists('sessions', 'prior_claude_session_ids')) {
      db.exec('ALTER TABLE sessions ADD COLUMN prior_claude_session_ids TEXT');
    }
    if (!columnExists('sessions', 'deleted_at')) {
      db.exec('ALTER TABLE sessions ADD COLUMN deleted_at TEXT');
    }
  }
  if (tableExists('tasks')) {
    if (!columnExists('tasks', 'parent_external_id')) {
      db.exec('ALTER TABLE tasks ADD COLUMN parent_external_id TEXT');
    }
    if (!columnExists('tasks', 'worktree_path')) {
      db.exec('ALTER TABLE tasks ADD COLUMN worktree_path TEXT');
    }
    if (!columnExists('tasks', 'worktree_branch')) {
      db.exec('ALTER TABLE tasks ADD COLUMN worktree_branch TEXT');
    }
    if (!columnExists('tasks', 'worktree_base_branch')) {
      db.exec('ALTER TABLE tasks ADD COLUMN worktree_base_branch TEXT');
    }
  }
}

export function createDatabase(dbPath: string): Database {
  const db = openDatabase(dbPath);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
