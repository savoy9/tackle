import { describe, it, expect } from 'vitest';
import type { Task, Session, LayoutState } from '../index';

describe('shared types', () => {
  it('Task type has the expected shape', () => {
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
      kind: 'implement',
      status: 'running',
      psmux_name: 'tackle-gh-42-implement1',
      tab_label: '42-AuthBug|Implement1',
      agent: null,
      worktree_path: null,
      sort_order: 0,
      claude_session_id: null,
      started_at: '2026-04-18T00:00:00Z',
      ended_at: null,
    };

    expect(session.task_id).toBeNull();
    expect(session.kind).toBe('implement');
    expect(session.status).toBe('running');
    expect(session.ended_at).toBeNull();
  });

  it('Session supports all kind values', () => {
    const kinds = ['plan', 'implement', 'review', 'debug', 'test', 'pilot', 'shell'] as const;
    for (const kind of kinds) {
      const session: Session = {
        id: 1,
        task_id: null,
        phase_id: null,
        name: `${kind}-session`,
        kind,
        status: 'running',
        psmux_name: `tackle-gh-1-${kind}1`,
        tab_label: `1-Task|${kind}1`,
        agent: null,
        worktree_path: null,
        sort_order: 0,
        claude_session_id: null,
        started_at: '2026-04-18T00:00:00Z',
        ended_at: null,
      };
      expect(session.kind).toBe(kind);
    }
  });

  it('LayoutState type has the expected shape', () => {
    const layout: LayoutState = {
      task_id: '42',
      editor_layout: { orientation: 0, groups: [{ size: 0.65 }, { size: 0.35 }] },
      terminal_placements: [{ session_id: 1, group_index: 0 }],
      review_files: ['file:///readme.md'],
      focused_session_id: '1',
      focused_group_index: 0,
    };

    expect(layout.terminal_placements).toHaveLength(1);
    expect(layout.review_files).toHaveLength(1);
  });
});
