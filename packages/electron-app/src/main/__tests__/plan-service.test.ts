import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { PlanRepository } from '../plan-repository';
import { PhaseRepository } from '../phase-repository';
import { PlanService } from '../plan-service';

describe('PlanService', () => {
  let db: Database;
  let service: PlanService;

  beforeEach(() => {
    db = createDatabase(':memory:');

    // Seed a task
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('42', 'github', 'Auth feature', 'open');

    service = new PlanService(
      new PlanRepository(db),
      new PhaseRepository(db),
    );
  });

  afterEach(() => {
    db?.close();
  });

  it('links a plan and extracts phases from markdown content', () => {
    const markdown = `
# Auth Plan

### Phase 1: Middleware

Build the auth middleware.

### Phase 2: Token Refresh

Add token refresh logic.

### Phase 3: Error Handling

Handle auth errors.
`;

    const result = service.linkPlan(1, './plans/auth.md', markdown);

    expect(result.plan.task_id).toBe(1);
    expect(result.plan.source_path).toBe('./plans/auth.md');
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].name).toBe('Middleware');
    expect(result.phases[1].name).toBe('Token Refresh');
    expect(result.phases[2].name).toBe('Error Handling');

    // Verify phases are persisted
    const stored = service.getPhasesForTask(1);
    expect(stored).toHaveLength(3);
    expect(stored[0].task_id).toBe(1);
    expect(stored[0].status).toBe('pending');
  });

  it('returns empty phases when markdown has no recognizable structure', () => {
    const markdown = `# Just some notes\n\nNo phases here.`;

    const result = service.linkPlan(1, './plans/notes.md', markdown);

    expect(result.plan.task_id).toBe(1);
    expect(result.phases).toHaveLength(0);
  });

  it('replaces existing plan when re-linking', () => {
    const md1 = `### Phase 1: First\n\nContent.`;
    const md2 = `### Phase 1: Revised\n\nNew content.\n\n### Phase 2: Added\n\nMore.`;

    service.linkPlan(1, './plans/v1.md', md1);
    const result = service.linkPlan(1, './plans/v2.md', md2);

    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].name).toBe('Revised');

    // Old phases should be gone
    const stored = service.getPhasesForTask(1);
    expect(stored).toHaveLength(2);
  });
});
