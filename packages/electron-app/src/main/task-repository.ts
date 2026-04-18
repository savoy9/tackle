import type { Task } from '@chartroom/shared';
import type { Database } from './db';

export interface UpsertTask {
  external_id: string;
  external_system: 'github' | 'ado';
  title: string;
  description: string;
  status: string;
  assignee: string | null;
}

export class TaskRepository {
  constructor(private db: Database) {}

  list(): Task[] {
    return this.db.prepare<Task>('SELECT * FROM tasks ORDER BY id').all() as Task[];
  }

  get(id: number): Task | undefined {
    return this.db.prepare<Task>('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  }

  upsert(task: UpsertTask): void {
    this.db
      .prepare(
        `INSERT INTO tasks (external_id, external_system, title, description, status, assignee, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(external_system, external_id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           assignee = excluded.assignee,
           synced_at = datetime('now')`,
      )
      .run(
        task.external_id,
        task.external_system,
        task.title,
        task.description,
        task.status,
        task.assignee,
      );
  }
}
