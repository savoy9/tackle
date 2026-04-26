import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type Database } from '../db';
import { SessionManager, type TerminalBackend } from '../session-manager';

// Mock terminal backend
let paneCount = 0;
const mockBackend: TerminalBackend = {
  createPane: vi.fn(() => {
    paneCount++;
  }),
  listPanes: vi.fn(() => Array.from({ length: paneCount + 1 }, (_, i) => ({ index: i }))),
};

describe('SessionManager', () => {
  let db: Database;
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    paneCount = 0;
    db = createDatabase(':memory:');
    manager = new SessionManager(db, mockBackend, 'test-session');
  });

  afterEach(() => {
    db?.close();
  });

  it('creates a session and persists to DB', () => {
    const session = manager.create({ name: 'impl-1' });

    expect(session.id).toBeDefined();
    expect(session.name).toBe('impl-1');
    expect(session.status).toBe('running');
    expect(session.terminal_id).toBeDefined();
    expect(mockBackend.createPane).toHaveBeenCalled();

    // Verify it's in the DB
    const dbSession = manager.get(session.id);
    expect(dbSession).toBeDefined();
    expect(dbSession!.name).toBe('impl-1');
  });

  it('lists all sessions from DB', () => {
    manager.create({ name: 'session-1' });
    manager.create({ name: 'session-2' });

    const sessions = manager.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].name).toBe('session-1');
    expect(sessions[1].name).toBe('session-2');
  });

  it('stops a session and updates DB status', () => {
    const session = manager.create({ name: 'to-stop' });
    manager.stop(session.id);

    const updated = manager.get(session.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.ended_at).not.toBeNull();
  });

  it('creates a session with optional task association', () => {
    // First insert a task so the FK is valid
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Test task', 'open');

    const session = manager.create({ name: 'task-session', taskId: 1 });
    expect(session.task_id).toBe(1);

    const fetched = manager.get(session.id);
    expect(fetched!.task_id).toBe(1);
  });

  it('creates a session without task association', () => {
    const session = manager.create({ name: 'free-session' });
    expect(session.task_id).toBeNull();
  });

  it('lists sessions for a specific task', () => {
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Task A', 'open');

    manager.create({ name: 'task-1-session', taskId: 1 });
    manager.create({ name: 'free-session' });

    const taskSessions = manager.listForTask(1);
    expect(taskSessions).toHaveLength(1);
    expect(taskSessions[0].name).toBe('task-1-session');
  });

  it('creates an agent session by default', () => {
    const session = manager.create({ name: 'agent-session' });
    expect(session.kind).toBe('agent');

    const fetched = manager.get(session.id);
    expect(fetched!.kind).toBe('agent');
  });

  it('creates a terminal tab session', () => {
    const session = manager.create({ name: 'dev-server', kind: 'terminal' });
    expect(session.kind).toBe('terminal');

    const fetched = manager.get(session.id);
    expect(fetched!.kind).toBe('terminal');
  });

  it('creates a session linked to a phase', () => {
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Task A', 'open');
    db.prepare(`INSERT INTO plans (task_id, source_path) VALUES (?, ?)`).run(1, './plans/test.md');
    db.prepare(`INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)`).run(
      1,
      1,
      'Phase 1',
      0,
    );

    const session = manager.create({ name: 'phase-session', taskId: 1, phaseId: 1 });
    expect(session.phase_id).toBe(1);

    const fetched = manager.get(session.id);
    expect(fetched!.phase_id).toBe(1);
  });

  it('lists sessions filtered by phase', () => {
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('1', 'github', 'Task A', 'open');
    db.prepare(`INSERT INTO plans (task_id, source_path) VALUES (?, ?)`).run(1, './plans/test.md');
    db.prepare(`INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)`).run(
      1,
      1,
      'Phase 1',
      0,
    );
    db.prepare(`INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)`).run(
      1,
      1,
      'Phase 2',
      1,
    );

    manager.create({ name: 'phase-1-session', taskId: 1, phaseId: 1 });
    manager.create({ name: 'phase-2-session', taskId: 1, phaseId: 2 });
    manager.create({ name: 'task-level-session', taskId: 1 });

    const phase1Sessions = manager.listForPhase(1);
    expect(phase1Sessions).toHaveLength(1);
    expect(phase1Sessions[0].name).toBe('phase-1-session');
  });
});
