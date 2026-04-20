import { describe, it, expect } from 'vitest';
import type { Task, Session } from '../index';

describe('shared types', () => {
  it('Task type has the expected shape', () => {
    // Verify the type compiles and a conforming object is valid
    const task: Task = {
      id: 1,
      external_id: 'GH-42',
      external_system: 'github',
      title: 'Test task',
      description: 'A test task description',
      status: 'open',
      assignee: 'alice',
      synced_at: '2026-04-18T00:00:00Z',
      created_at: '2026-04-18T00:00:00Z',
    };

    expect(task.id).toBe(1);
    expect(task.external_system).toBe('github');
    expect(task.title).toBe('Test task');
  });

  it('Session type has the expected shape', () => {
    const session: Session = {
      id: 1,
      task_id: null,
      phase_id: null,
      name: 'impl-session-1',
      kind: 'agent',
      status: 'running',
      psmux_session: 'chartroom-1',
      started_at: '2026-04-18T00:00:00Z',
      ended_at: null,
    };

    expect(session.task_id).toBeNull();
    expect(session.kind).toBe('agent');
    expect(session.status).toBe('running');
    expect(session.ended_at).toBeNull();
  });

  it('Session can be associated with a task', () => {
    const session: Session = {
      id: 2,
      task_id: 42,
      phase_id: null,
      name: 'debug-session',
      kind: 'agent',
      status: 'completed',
      psmux_session: 'chartroom-2',
      started_at: '2026-04-18T00:00:00Z',
      ended_at: '2026-04-18T01:00:00Z',
    };

    expect(session.task_id).toBe(42);
    expect(session.ended_at).not.toBeNull();
  });
});
