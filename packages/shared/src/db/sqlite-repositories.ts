import type { Task, Session, LayoutState, Plan, Phase, AgentState } from '../index';
import type { Database } from './database';
import type {
  TaskRepository,
  SessionRepository,
  LayoutStateRepository,
  PlanRepository,
  PhaseRepository,
  UpsertTask,
  CreateSession,
  UpdateSession,
  TaskWorktreeFields,
} from './repositories';

function buildDynamicUpdate(
  db: Database,
  table: string,
  id: number,
  fields: Record<string, unknown>,
): void {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (setClauses.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
}

// On conflict we deliberately do NOT overwrite `external_status`. The Event
// Bus is the sole writer of that column — Sync diffs current vs incoming
// state, dispatches `external.status_changed` events, and the handler does
// the write (and the audit log + refresh that go with it). If we updated
// the column here, the handler would observe `from === to` and treat every
// transition as an idempotent no-op.
const UPSERT_TASK_SQL = `INSERT INTO tasks (external_id, external_system, title, description, external_status, assignee, parent_external_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(external_system, external_id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       assignee = excluded.assignee,
       parent_external_id = excluded.parent_external_id,
       synced_at = datetime('now')`;

export class SqliteTaskRepository implements TaskRepository {
  constructor(private db: Database) {}

  list(): Promise<Task[]> {
    return Promise.resolve(this.db.prepare<Task>('SELECT * FROM tasks ORDER BY id').all());
  }

  get(id: number): Promise<Task | undefined> {
    return Promise.resolve(this.db.prepare<Task>('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  upsert(task: UpsertTask): Promise<void> {
    this.db
      .prepare(UPSERT_TASK_SQL)
      .run(
        task.external_id,
        task.external_system,
        task.title,
        task.description,
        task.external_status,
        task.assignee,
        task.parent_external_id ?? null,
      );
    return Promise.resolve();
  }

  upsertBatch(tasks: UpsertTask[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      const stmt = this.db.prepare(UPSERT_TASK_SQL);
      for (const task of tasks) {
        stmt.run(
          task.external_id,
          task.external_system,
          task.title,
          task.description,
          task.external_status,
          task.assignee,
          task.parent_external_id ?? null,
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return Promise.resolve();
  }

  setWorktree(id: number, fields: TaskWorktreeFields): Promise<void> {
    this.db
      .prepare(
        'UPDATE tasks SET worktree_path = ?, worktree_branch = ?, worktree_base_branch = ? WHERE id = ?',
      )
      .run(fields.worktree_path, fields.worktree_branch, fields.worktree_base_branch, id);
    return Promise.resolve();
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private db: Database) {}

  private mapSession(row: any): Session {
    return {
      ...row,
      prior_claude_session_ids: row.prior_claude_session_ids
        ? JSON.parse(row.prior_claude_session_ids)
        : null,
    };
  }

  list(): Promise<Session[]> {
    const rows = this.db.prepare<any>('SELECT * FROM sessions ORDER BY id').all();
    return Promise.resolve(rows.map((r) => this.mapSession(r)));
  }

  get(id: number): Promise<Session | undefined> {
    const row = this.db.prepare<any>('SELECT * FROM sessions WHERE id = ?').get(id);
    return Promise.resolve(row ? this.mapSession(row) : undefined);
  }

  listForTask(taskId: number): Promise<Session[]> {
    const rows = this.db
      .prepare<any>('SELECT * FROM sessions WHERE task_id = ? ORDER BY sort_order, id')
      .all(taskId);
    return Promise.resolve(rows.map((r) => this.mapSession(r)));
  }

  create(session: CreateSession): Promise<Session> {
    const result = this.db
      .prepare(
        `INSERT INTO sessions (task_id, phase_id, name, kind, psmux_name, tab_label, agent, worktree_path, sort_order, claude_session_id, agent_state, prior_claude_session_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.task_id,
        session.phase_id,
        session.name,
        session.kind,
        session.psmux_name,
        session.tab_label ?? '',
        session.agent ?? null,
        session.worktree_path ?? null,
        session.sort_order ?? 0,
        session.claude_session_id ?? null,
        session.agent_state ?? 'idle',
        session.prior_claude_session_ids ? JSON.stringify(session.prior_claude_session_ids) : null,
      );
    const id = Number(result.lastInsertRowid);
    const row = this.db.prepare<any>('SELECT * FROM sessions WHERE id = ?').get(id)!;
    return Promise.resolve(this.mapSession(row));
  }

  update(id: number, fields: UpdateSession): Promise<void> {
    const mapped: Record<string, unknown> = { ...fields };
    if ('prior_claude_session_ids' in fields) {
      mapped.prior_claude_session_ids = fields.prior_claude_session_ids
        ? JSON.stringify(fields.prior_claude_session_ids)
        : null;
    }
    buildDynamicUpdate(this.db, 'sessions', id, mapped);
    return Promise.resolve();
  }

  complete(id: number): Promise<void> {
    this.db
      .prepare(`UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?`)
      .run(id);
    return Promise.resolve();
  }

  softDelete(id: number): Promise<void> {
    this.db.prepare(`UPDATE sessions SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    return Promise.resolve();
  }

  setAgentState(id: number, state: AgentState): Promise<void> {
    this.db.prepare('UPDATE sessions SET agent_state = ? WHERE id = ?').run(state, id);
    return Promise.resolve();
  }
}

interface LayoutStateRow {
  task_id: string;
  editor_layout: string;
  terminal_placements: string;
  review_files: string;
  focused_session_id: string | null;
  focused_group_index: number | null;
}

export class SqliteLayoutStateRepository implements LayoutStateRepository {
  constructor(private db: Database) {}

  get(taskId: string): Promise<LayoutState | undefined> {
    const row = this.db
      .prepare<LayoutStateRow>('SELECT * FROM layout_states WHERE task_id = ?')
      .get(taskId);
    if (!row) return Promise.resolve(undefined);
    return Promise.resolve({
      task_id: row.task_id,
      editor_layout: JSON.parse(row.editor_layout),
      terminal_placements: JSON.parse(row.terminal_placements),
      review_files: JSON.parse(row.review_files),
      focused_session_id: row.focused_session_id,
      focused_group_index: row.focused_group_index,
    });
  }

  save(state: LayoutState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO layout_states (task_id, editor_layout, terminal_placements, review_files, focused_session_id, focused_group_index)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           editor_layout = excluded.editor_layout,
           terminal_placements = excluded.terminal_placements,
           review_files = excluded.review_files,
           focused_session_id = excluded.focused_session_id,
           focused_group_index = excluded.focused_group_index`,
      )
      .run(
        state.task_id,
        JSON.stringify(state.editor_layout),
        JSON.stringify(state.terminal_placements),
        JSON.stringify(state.review_files),
        state.focused_session_id,
        state.focused_group_index,
      );
    return Promise.resolve();
  }
}

export class SqlitePlanRepository implements PlanRepository {
  constructor(private db: Database) {}

  get(taskId: number): Promise<Plan | undefined> {
    return Promise.resolve(
      this.db.prepare<Plan>('SELECT * FROM plans WHERE task_id = ?').get(taskId),
    );
  }

  save(plan: Omit<Plan, 'id' | 'created_at'>): Promise<Plan> {
    this.db
      .prepare(
        `INSERT INTO plans (task_id, source_path, source_kind, source_ref, extracted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           source_path = excluded.source_path,
           source_kind = excluded.source_kind,
           source_ref = excluded.source_ref,
           extracted_at = excluded.extracted_at`,
      )
      .run(
        plan.task_id,
        plan.source_path,
        plan.source_kind,
        plan.source_ref,
        plan.extracted_at,
      );
    // Re-read by task_id rather than lastInsertRowid: on the ON CONFLICT
    // update path SQLite doesn't guarantee the rowid points at the
    // updated row.
    return Promise.resolve(
      this.db.prepare<Plan>('SELECT * FROM plans WHERE task_id = ?').get(plan.task_id)!,
    );
  }
}

export class SqlitePhaseRepository implements PhaseRepository {
  constructor(private db: Database) {}

  listForPlan(planId: number): Promise<Phase[]> {
    return Promise.resolve(
      this.db
        .prepare<Phase>('SELECT * FROM phases WHERE plan_id = ? ORDER BY sort_order, id')
        .all(planId),
    );
  }

  get(id: number): Promise<Phase | undefined> {
    return Promise.resolve(this.db.prepare<Phase>('SELECT * FROM phases WHERE id = ?').get(id));
  }

  update(
    id: number,
    fields: Partial<Pick<Phase, 'name' | 'description' | 'status' | 'sort_order'>>,
  ): Promise<void> {
    buildDynamicUpdate(this.db, 'phases', id, fields as Record<string, unknown>);
    return Promise.resolve();
  }
}
