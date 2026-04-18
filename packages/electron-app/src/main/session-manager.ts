import type { Session } from '@chartroom/shared';
import type { Database } from './db';
import type { TerminalManager } from './terminal-manager';

export interface CreateSessionOptions {
  name: string;
  taskId?: number;
  command?: string;
}

export interface ManagedSession extends Session {
  terminal_id: string;
}

export class SessionManager {
  constructor(
    private db: Database,
    private terminalManager: TerminalManager,
  ) {}

  create(options: CreateSessionOptions): ManagedSession {
    const terminal = this.terminalManager.create(options.command);

    const result = this.db
      .prepare(
        `INSERT INTO sessions (task_id, name, status, psmux_session, started_at)
         VALUES (?, ?, 'running', ?, datetime('now'))`,
      )
      .run(options.taskId ?? null, options.name, terminal.id);

    const id = Number(result.lastInsertRowid);
    return this.get(id)!;
  }

  get(id: number): ManagedSession | undefined {
    const row = this.db.prepare<Session>('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Session
      | undefined;

    if (!row) return undefined;
    return { ...row, terminal_id: row.psmux_session };
  }

  list(): ManagedSession[] {
    const rows = this.db.prepare<Session>('SELECT * FROM sessions ORDER BY id').all() as Session[];

    return rows.map((row) => ({ ...row, terminal_id: row.psmux_session }));
  }

  listForTask(taskId: number): ManagedSession[] {
    const rows = this.db
      .prepare<Session>('SELECT * FROM sessions WHERE task_id = ? ORDER BY id')
      .all(taskId) as Session[];

    return rows.map((row) => ({ ...row, terminal_id: row.psmux_session }));
  }

  stop(id: number): void {
    const session = this.get(id);
    if (!session) return;

    this.terminalManager.destroy(session.terminal_id);

    this.db
      .prepare(`UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?`)
      .run(id);
  }
}
