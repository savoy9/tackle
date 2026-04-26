import type { Phase } from '@tackle/shared';
import type { Database } from './db';

export interface CreatePhaseOptions {
  plan_id: number;
  task_id: number;
  name: string;
  description?: string;
  sort_order: number;
}

export class PhaseRepository {
  constructor(private db: Database) {}

  create(options: CreatePhaseOptions): Phase {
    const result = this.db
      .prepare(
        `INSERT INTO phases (plan_id, task_id, name, description, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        options.plan_id,
        options.task_id,
        options.name,
        options.description ?? '',
        options.sort_order,
      );

    return {
      id: Number(result.lastInsertRowid),
      plan_id: options.plan_id,
      task_id: options.task_id,
      name: options.name,
      description: options.description ?? '',
      status: 'pending',
      sort_order: options.sort_order,
      created_at: new Date().toISOString(),
    };
  }

  get(id: number): Phase | undefined {
    return this.db.prepare<Phase>('SELECT * FROM phases WHERE id = ?').get(id) as Phase | undefined;
  }

  listForPlan(planId: number): Phase[] {
    return this.db
      .prepare<Phase>('SELECT * FROM phases WHERE plan_id = ? ORDER BY sort_order')
      .all(planId) as Phase[];
  }

  listForTask(taskId: number): Phase[] {
    return this.db
      .prepare<Phase>('SELECT * FROM phases WHERE task_id = ? ORDER BY sort_order')
      .all(taskId) as Phase[];
  }

  updateStatus(id: number, status: Phase['status']): void {
    this.db.prepare('UPDATE phases SET status = ? WHERE id = ?').run(status, id);
  }

  deleteForPlan(planId: number): void {
    this.db.prepare('DELETE FROM phases WHERE plan_id = ?').run(planId);
  }

  deleteForTask(taskId: number): void {
    this.db.prepare('DELETE FROM phases WHERE task_id = ?').run(taskId);
  }
}
