import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { render } from '../sidebar/render';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';

// All existing snapshot scenarios represent the post-activation sidebar.
// Default every test to that by spreading an activated base.
const activatedState: SidebarState = { ...initialState, isActivated: true };

const task = (id: number, title: string, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  external_status: 'open',
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: 'not_started',
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
  started_at: '',
  ended_at: null,
  ...over,
});

describe('render snapshots — canonical List Mode states (#29)', () => {
  it('empty list', () => {
    expect(render(activatedState)).toMatchSnapshot();
  });

  it('List with Active + idle + waiting-for-input tasks', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [
        task(1, 'Active task', { synced_at: '2026-04-10' }),
        task(2, 'Idle task', { synced_at: '2026-04-05' }),
        task(3, 'Waiting task', { synced_at: '2026-04-01' }),
      ],
      sessions: [
        sess(10, 1, { status: 'running', agent_state: 'idle' }),
        sess(20, 3, { status: 'running', agent_state: 'waiting' }),
      ],
      activeTaskId: 1,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('expanded card with mixed-state sessions', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [task(1, 'Big task')],
      sessions: [
        sess(10, 1, { status: 'running', agent_state: 'working', tab_label: 'impl-1' }),
        sess(11, 1, { status: 'running', agent_state: 'waiting', tab_label: 'impl-2' }),
        sess(12, 1, { status: 'stopped', tab_label: 'old' }),
        sess(13, 1, { status: 'completed', tab_label: 'done' }),
      ],
      expandedCardIds: new Set([1]),
      activeTaskId: 1,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('card with zero sessions shows + New session affordance', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [task(1, 'Fresh task')],
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('mixed open+closed tasks, closed folder collapsed', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [
        task(1, 'Open A', { synced_at: '2026-04-10' }),
        task(2, 'Closed A', { external_status: 'closed', synced_at: '2026-03-20' }),
        task(3, 'Open B', { synced_at: '2026-04-05' }),
        task(4, 'Closed B', { external_status: 'done', synced_at: '2026-03-15' }),
      ],
      closedFolderOpen: false,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('mixed open+closed tasks, closed folder expanded', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [
        task(1, 'Open A', { synced_at: '2026-04-10' }),
        task(2, 'Closed A', { external_status: 'closed', synced_at: '2026-03-20' }),
        task(3, 'Open B', { synced_at: '2026-04-05' }),
        task(4, 'Closed B', { external_status: 'done', synced_at: '2026-03-15' }),
      ],
      closedFolderOpen: true,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('full state matrix — Active, Running-non-active, Idle, Closed (#46)', () => {
    const state: SidebarState = {
      ...activatedState,
      tasks: [
        task(1, 'Active task', { synced_at: '2026-04-10' }),
        task(2, 'Running task', { synced_at: '2026-04-09' }),
        task(3, 'Idle task', { synced_at: '2026-04-08' }),
        task(4, 'Closed task', { external_status: 'closed', synced_at: '2026-03-15' }),
      ],
      sessions: [
        sess(10, 1, { status: 'running', agent_state: 'idle' }),
        sess(20, 2, { status: 'running', agent_state: 'working' }),
      ],
      activeTaskId: 1,
      closedFolderOpen: true,
    };
    expect(render(state)).toMatchSnapshot();
  });
});
