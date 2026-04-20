import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { PlanRepository } from '../plan-repository';
import { PhaseRepository } from '../phase-repository';

describe('PhaseRepository', () => {
  let db: Database;
  let planRepo: PlanRepository;
  let phaseRepo: PhaseRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    planRepo = new PlanRepository(db);
    phaseRepo = new PhaseRepository(db);

    // Seed a task and plan
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status)
       VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Build auth', 'open');
    planRepo.create({ task_id: 1, source_path: './plans/auth.md' });
  });

  afterEach(() => {
    db?.close();
  });

  it('creates phases and lists them in sort order', () => {
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Auth middleware', sort_order: 1 });
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Token refresh', sort_order: 2 });
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Error handling', sort_order: 0 });

    const phases = phaseRepo.listForPlan(1);

    expect(phases).toHaveLength(3);
    expect(phases[0].name).toBe('Error handling');
    expect(phases[1].name).toBe('Auth middleware');
    expect(phases[2].name).toBe('Token refresh');
    expect(phases[0].status).toBe('pending');
  });

  it('updates phase status', () => {
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Phase 1', sort_order: 0 });

    phaseRepo.updateStatus(1, 'in_progress');
    let phase = phaseRepo.get(1);
    expect(phase!.status).toBe('in_progress');

    phaseRepo.updateStatus(1, 'done');
    phase = phaseRepo.get(1);
    expect(phase!.status).toBe('done');
  });

  it('lists phases for a task', () => {
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Phase A', sort_order: 0 });
    phaseRepo.create({ plan_id: 1, task_id: 1, name: 'Phase B', sort_order: 1 });

    const phases = phaseRepo.listForTask(1);
    expect(phases).toHaveLength(2);

    const empty = phaseRepo.listForTask(999);
    expect(empty).toHaveLength(0);
  });
});
