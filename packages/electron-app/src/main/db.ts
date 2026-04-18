// Thin SQLite abstraction that works with both better-sqlite3 (Electron/Node)
// and bun:sqlite (tests under Bun runtime).

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
    // @ts-expect-error bun:sqlite is only available in Bun runtime
    const { Database: BunDB } = require('bun:sqlite');
    const db = new BunDB(dbPath);
    db.run('PRAGMA journal_mode = WAL');
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
    // Fall back to better-sqlite3 (Node/Electron)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
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
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'stopped')),
    psmux_session TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
    ON tasks(external_system, external_id);
`;

export function createDatabase(dbPath: string): Database {
  const db = openDatabase(dbPath);
  db.exec(SCHEMA);
  return db;
}
