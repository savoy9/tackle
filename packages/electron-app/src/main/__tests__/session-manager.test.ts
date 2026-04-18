import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type Database } from '../db';
import { SessionManager } from '../session-manager';

// Mock terminal manager
const mockTerminalManager = {
  create: vi.fn(() => ({ id: 'term-abc', status: 'running' as const, pid: 999 })),
  list: vi.fn(() => []),
  destroy: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  onData: vi.fn(),
  get: vi.fn(),
  destroyAll: vi.fn(),
};

describe('SessionManager', () => {
  let db: Database;
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createDatabase(':memory:');
    manager = new SessionManager(db, mockTerminalManager as any);
  });

  afterEach(() => {
    db?.close();
  });

  it('creates a session and persists to DB', () => {
    const session = manager.create({ name: 'impl-1' });

    expect(session.id).toBeDefined();
    expect(session.name).toBe('impl-1');
    expect(session.status).toBe('running');
    expect(session.terminal_id).toBe('term-abc');
    expect(mockTerminalManager.create).toHaveBeenCalled();

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
    expect(mockTerminalManager.destroy).toHaveBeenCalledWith('term-abc');
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
});
