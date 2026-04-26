import type { Plan } from '@tackle/shared';
import type { Database } from './db';

export interface CreatePlanOptions {
  task_id: number;
  source_path: string;
}

export class PlanRepository {
  constructor(private db: Database) {}

  create(options: CreatePlanOptions): Plan {
    const result = this.db
      .prepare(
        `INSERT INTO plans (task_id, source_path, created_at)
         VALUES (?, ?, datetime('now'))`,
      )
      .run(options.task_id, options.source_path);

    return {
      id: Number(result.lastInsertRowid),
      task_id: options.task_id,
      source_path: options.source_path,
      extracted_at: null,
      created_at: new Date().toISOString(),
    };
  }

  getForTask(taskId: number): Plan | undefined {
    return this.db.prepare<Plan>('SELECT * FROM plans WHERE task_id = ?').get(taskId) as
      | Plan
      | undefined;
  }

  deleteForTask(taskId: number): void {
    this.db.prepare('DELETE FROM plans WHERE task_id = ?').run(taskId);
  }
}
