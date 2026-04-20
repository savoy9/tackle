import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { PlanRepository } from '../plan-repository';

describe('PlanRepository', () => {
  let db: Database;
  let repo: PlanRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new PlanRepository(db);

    // Seed a task
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status)
       VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Build auth', 'open');
  });

  afterEach(() => {
    db?.close();
  });

  it('creates a plan linked to a task and retrieves it', () => {
    const plan = repo.create({ task_id: 1, source_path: './plans/auth-plan.md' });

    expect(plan.id).toBeDefined();
    expect(plan.task_id).toBe(1);
    expect(plan.source_path).toBe('./plans/auth-plan.md');

    const retrieved = repo.getForTask(1);
    expect(retrieved).toBeDefined();
    expect(retrieved!.source_path).toBe('./plans/auth-plan.md');
  });

  it('returns undefined when task has no plan', () => {
    const plan = repo.getForTask(999);
    expect(plan).toBeUndefined();
  });
});
