import type { Task, Session, LayoutState, Plan, Phase } from '../index';
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

const UPSERT_TASK_SQL = `INSERT INTO tasks (external_id, external_system, title, description, status, assignee, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(external_system, external_id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       status = excluded.status,
       assignee = excluded.assignee,
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
    this.db.prepare(UPSERT_TASK_SQL)
      .run(task.external_id, task.external_system, task.title, task.description, task.status, task.assignee);
    return Promise.resolve();
  }

  upsertBatch(tasks: UpsertTask[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      const stmt = this.db.prepare(UPSERT_TASK_SQL);
      for (const task of tasks) {
        stmt.run(task.external_id, task.external_system, task.title, task.description, task.status, task.assignee);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return Promise.resolve();
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private db: Database) {}

  list(): Promise<Session[]> {
    return Promise.resolve(this.db.prepare<Session>('SELECT * FROM sessions ORDER BY id').all());
  }

  get(id: number): Promise<Session | undefined> {
    return Promise.resolve(this.db.prepare<Session>('SELECT * FROM sessions WHERE id = ?').get(id));
  }

  listForTask(taskId: number): Promise<Session[]> {
    return Promise.resolve(
      this.db.prepare<Session>('SELECT * FROM sessions WHERE task_id = ? ORDER BY sort_order, id').all(taskId),
    );
  }

  create(session: CreateSession): Promise<Session> {
    const result = this.db
      .prepare(
        `INSERT INTO sessions (task_id, phase_id, name, kind, psmux_name, tab_label, agent, worktree_path, sort_order, claude_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      );
    const id = Number(result.lastInsertRowid);
    return Promise.resolve(this.db.prepare<Session>('SELECT * FROM sessions WHERE id = ?').get(id)!);
  }

  update(id: number, fields: UpdateSession): Promise<void> {
    buildDynamicUpdate(this.db, 'sessions', id, fields as Record<string, unknown>);
    return Promise.resolve();
  }

  complete(id: number): Promise<void> {
    this.db.prepare(`UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?`).run(id);
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
    const row = this.db.prepare<LayoutStateRow>('SELECT * FROM layout_states WHERE task_id = ?').get(taskId);
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
    return Promise.resolve(this.db.prepare<Plan>('SELECT * FROM plans WHERE task_id = ?').get(taskId));
  }

  save(plan: Omit<Plan, 'id' | 'created_at'>): Promise<Plan> {
    const result = this.db
      .prepare(
        `INSERT INTO plans (task_id, source_path, extracted_at)
         VALUES (?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           source_path = excluded.source_path,
           extracted_at = excluded.extracted_at`,
      )
      .run(plan.task_id, plan.source_path, plan.extracted_at);
    const id = Number(result.lastInsertRowid);
    return Promise.resolve(this.db.prepare<Plan>('SELECT * FROM plans WHERE id = ?').get(id)!);
  }
}

export class SqlitePhaseRepository implements PhaseRepository {
  constructor(private db: Database) {}

  listForPlan(planId: number): Promise<Phase[]> {
    return Promise.resolve(
      this.db.prepare<Phase>('SELECT * FROM phases WHERE plan_id = ? ORDER BY sort_order, id').all(planId),
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
