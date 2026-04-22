import type { Session } from '@tackle/shared';
import type { Database } from './db';

export interface CreateSessionOptions {
  name: string;
  taskId?: number;
  phaseId?: number;
  kind?: 'agent' | 'terminal';
  command?: string;
}

export interface ManagedSession extends Session {
  terminal_id: string;
}

export interface TerminalBackend {
  createPane(sessionName: string, windowTarget?: string): void;
  listPanes(sessionName: string, windowTarget?: string): { index: number }[];
}

export class SessionManager {
  constructor(
    private db: Database,
    private backend: TerminalBackend,
    private psmuxSessionName: string,
  ) {}

  create(options: CreateSessionOptions): ManagedSession {
    const kind = options.kind ?? 'agent';

    // Create a pane in the task's psmux session
    this.backend.createPane(this.psmuxSessionName);

    // Get the pane index (last created pane)
    const panes = this.backend.listPanes(this.psmuxSessionName);
    const paneIndex = panes.length > 0 ? panes[panes.length - 1].index : 0;
    const paneId = `${this.psmuxSessionName}:${paneIndex}`;

    const result = this.db
      .prepare(
        `INSERT INTO sessions (task_id, phase_id, name, kind, status, psmux_session, started_at)
         VALUES (?, ?, ?, ?, 'running', ?, datetime('now'))`,
      )
      .run(options.taskId ?? null, options.phaseId ?? null, options.name, kind, paneId);

    return {
      id: Number(result.lastInsertRowid),
      task_id: options.taskId ?? null,
      phase_id: options.phaseId ?? null,
      name: options.name,
      kind,
      status: 'running',
      psmux_session: paneId,
      started_at: new Date().toISOString(),
      ended_at: null,
      terminal_id: paneId,
    };
  }

  private toManaged(row: Session): ManagedSession {
    return { ...row, terminal_id: row.psmux_session };
  }

  get(id: number): ManagedSession | undefined {
    const row = this.db.prepare<Session>('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Session
      | undefined;

    if (!row) return undefined;
    return this.toManaged(row);
  }

  list(): ManagedSession[] {
    const rows = this.db.prepare<Session>('SELECT * FROM sessions ORDER BY id').all() as Session[];
    return rows.map((row) => this.toManaged(row));
  }

  listForTask(taskId: number): ManagedSession[] {
    const rows = this.db
      .prepare<Session>('SELECT * FROM sessions WHERE task_id = ? ORDER BY id')
      .all(taskId) as Session[];
    return rows.map((row) => this.toManaged(row));
  }

  listForPhase(phaseId: number): ManagedSession[] {
    const rows = this.db
      .prepare<Session>('SELECT * FROM sessions WHERE phase_id = ? ORDER BY id')
      .all(phaseId) as Session[];
    return rows.map((row) => this.toManaged(row));
  }

  stop(id: number): void {
    this.db
      .prepare(`UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?`)
      .run(id);
  }
}
