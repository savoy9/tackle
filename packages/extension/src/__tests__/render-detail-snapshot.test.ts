import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { render } from '../sidebar/render';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';

const task = (id: number, title: string, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  synced_at: '2026-04-01',
  created_at: '2026-04-01',
  ...over,
});

const sess = (id: number, task_id: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id,
  phase_id: null,
  name: `s${id}`,
  kind: 'implement',
  status: 'running',
  psmux_name: `p${id}`,
  tab_label: `session-${id}`,
  agent: null,
  worktree_path: null,
  sort_order: 0,
  claude_session_id: null,
  agent_state: 'idle',
  prior_claude_session_ids: null,
  started_at: '2026-04-10',
  ended_at: null,
  ...over,
});

describe('render snapshots — canonical Detail Mode states (#31)', () => {
  it('Detail with populated description + mixed sessions + footer', () => {
    const state: SidebarState = {
      ...initialState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [
        task(1, 'Main task', {
          external_id: '42',
          assignee: 'alice',
          parent_external_id: '10',
          synced_at: '2026-04-10',
        }),
        task(2, 'Other A', { external_id: '2', synced_at: '2026-04-08' }),
        task(3, 'Other B', { external_id: '3', synced_at: '2026-04-06' }),
      ],
      sessions: [
        sess(10, 1, { status: 'running', agent_state: 'working', worktree_path: '/wt/feature-main', tab_label: 'impl' }),
        sess(11, 1, { status: 'completed', tab_label: 'done' }),
      ],
      descriptionsByTaskId: {
        1: '<p>Hello <strong>world</strong></p>',
      },
      activeTaskId: 1,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail with no sessions', () => {
    const state: SidebarState = {
      ...initialState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'Lonely task', { external_id: '7', synced_at: '2026-04-10' })],
      descriptionsByTaskId: { 1: '' },
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail with externally-closed indicator', () => {
    const state: SidebarState = {
      ...initialState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'Closed task', { status: 'closed', synced_at: '2026-04-10' })],
      sessions: [
        sess(10, 1, { status: 'running', worktree_path: '/wt/feat-zz' }),
        sess(11, 1, { status: 'running', worktree_path: '/wt/feat-zz' }),
      ],
      descriptionsByTaskId: { 1: '' },
    };
    expect(render(state)).toMatchSnapshot();
  });
});
