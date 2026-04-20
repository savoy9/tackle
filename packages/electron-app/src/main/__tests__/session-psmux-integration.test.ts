import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { SessionManager } from '../session-manager';
import { PsmuxManager } from '../psmux-manager';

describe('SessionManager + PsmuxManager integration', () => {
  let db: Database;
  let psmux: PsmuxManager;
  let manager: SessionManager;
  const sessionName = `chartroom-integration-${Date.now()}`;

  beforeEach(() => {
    db = createDatabase(':memory:');
    psmux = new PsmuxManager();

    // Seed a task
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, status) VALUES (?, ?, ?, ?)`,
    ).run('42', 'github', 'Integration test task', 'open');

    // Create a psmux session for the task
    psmux.createSession(sessionName);

    manager = new SessionManager(db, psmux, sessionName);
  });

  afterEach(() => {
    db?.close();
    try {
      psmux.killSession(sessionName);
    } catch {
      // already dead
    }
  });

  it('creates an agent session as a psmux pane and records it in the DB', () => {
    const session = manager.create({ name: 'build-auth', taskId: 1 });

    expect(session.id).toBeDefined();
    expect(session.name).toBe('build-auth');
    expect(session.kind).toBe('agent');
    expect(session.status).toBe('running');

    // Verify it's in the DB
    const fetched = manager.get(session.id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe('build-auth');

    // Verify a pane was created in psmux
    const panes = psmux.listPanes(sessionName);
    expect(panes.length).toBeGreaterThanOrEqual(2); // default + new pane
  });

  it('creates a terminal tab session', () => {
    const session = manager.create({ name: 'npm-dev', kind: 'terminal' });

    expect(session.kind).toBe('terminal');

    const fetched = manager.get(session.id);
    expect(fetched!.kind).toBe('terminal');
  });
});
