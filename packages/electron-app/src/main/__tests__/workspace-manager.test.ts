import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { PsmuxManager } from '../psmux-manager';
import { SessionManager } from '../session-manager';
import { WorkspaceManager } from '../workspace-manager';

describe('WorkspaceManager', () => {
  let db: Database;
  let psmux: PsmuxManager;
  const createdSessions: string[] = [];

  beforeEach(() => {
    db = createDatabase(':memory:');
    psmux = new PsmuxManager();

    // Seed two tasks
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('42', 'github', 'Auth feature', 'open');
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('99', 'github', 'Fix bug', 'open');
  });

  afterEach(() => {
    db?.close();
    for (const name of createdSessions) {
      try { psmux.killSession(name); } catch { /* ignore */ }
    }
    createdSessions.length = 0;
  });

  function createWorkspace(): WorkspaceManager {
    const ws = new WorkspaceManager(db, psmux);
    // Track sessions for cleanup
    const origCreate = psmux.createSession.bind(psmux);
    psmux.createSession = (name: string) => {
      createdSessions.push(name);
      return origCreate(name);
    };
    return ws;
  }

  it('generates a psmux session name from a task', () => {
    const ws = createWorkspace();
    const name = ws.sessionNameForTask(1);
    expect(name).toBe('chartroom-github-42');
  });

  it('creates a psmux session when switching to a task for the first time', () => {
    const ws = createWorkspace();
    ws.switchTask(1);

    expect(psmux.hasSession('chartroom-github-42')).toBe(true);
    expect(ws.currentTaskId).toBe(1);
  });

  it('reuses existing psmux session on subsequent switches', () => {
    const ws = createWorkspace();
    ws.switchTask(1);
    ws.switchTask(2); // switch away
    ws.switchTask(1); // switch back

    // Should still have the session, not create a duplicate
    expect(psmux.hasSession('chartroom-github-42')).toBe(true);
    expect(ws.currentTaskId).toBe(1);
  });

  it('provides a SessionManager scoped to the current task', () => {
    const ws = createWorkspace();
    ws.switchTask(1);

    const sm = ws.sessionManager;
    const session = sm.create({ name: 'build-auth', taskId: 1 });
    expect(session.task_id).toBe(1);

    // Sessions are in the task's psmux session
    expect(session.psmux_session).toContain('chartroom-github-42');
  });

  it('switches session manager when switching tasks', () => {
    const ws = createWorkspace();

    ws.switchTask(1);
    ws.sessionManager.create({ name: 'task-1-session', taskId: 1 });

    ws.switchTask(2);
    ws.sessionManager.create({ name: 'task-2-session', taskId: 2 });

    // Each task's sessions are tracked separately in the DB
    const task1Sessions = ws.sessionManager.listForTask(1);
    const task2Sessions = ws.sessionManager.listForTask(2);
    expect(task1Sessions).toHaveLength(1);
    expect(task2Sessions).toHaveLength(1);
    expect(task1Sessions[0].name).toBe('task-1-session');
    expect(task2Sessions[0].name).toBe('task-2-session');
  });

  it('returns null task id when no task is selected', () => {
    const ws = createWorkspace();
    expect(ws.currentTaskId).toBeNull();
  });

  it('creates a tmux window for a phase', () => {
    const ws = createWorkspace();
    ws.switchTask(1);

    // Seed plan and phase
    db.prepare('INSERT INTO plans (task_id, source_path) VALUES (?, ?)').run(1, './p.md');
    db.prepare('INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)').run(1, 1, 'Auth Middleware', 0);

    ws.ensurePhaseWindow(1);

    const windows = psmux.listWindows('chartroom-github-42');
    expect(windows.some((w) => w.name === '0-auth-middleware')).toBe(true);
  });

  it('switches active tmux window when selecting a phase', () => {
    const ws = createWorkspace();
    ws.switchTask(1);

    db.prepare('INSERT INTO plans (task_id, source_path) VALUES (?, ?)').run(1, './p.md');
    db.prepare('INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)').run(1, 1, 'Phase A', 0);
    db.prepare('INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)').run(1, 1, 'Phase B', 1);

    ws.ensurePhaseWindow(1);
    ws.ensurePhaseWindow(2);

    ws.selectPhase(2);

    const windows = psmux.listWindows('chartroom-github-42');
    const active = windows.find((w) => w.active);
    expect(active?.name).toBe('1-phase-b');
  });

  it('selects the default window when deselecting a phase', () => {
    const ws = createWorkspace();
    ws.switchTask(1);

    db.prepare('INSERT INTO plans (task_id, source_path) VALUES (?, ?)').run(1, './p.md');
    db.prepare('INSERT INTO phases (plan_id, task_id, name, sort_order) VALUES (?, ?, ?, ?)').run(1, 1, 'Phase A', 0);

    ws.ensurePhaseWindow(1);
    ws.selectPhase(1);
    ws.selectPhase(null); // deselect

    const windows = psmux.listWindows('chartroom-github-42');
    const active = windows.find((w) => w.active);
    // Should be back to the first (default) window
    expect(active?.index).toBe(0);
  });
});
