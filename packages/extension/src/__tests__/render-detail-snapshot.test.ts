import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { render } from '../sidebar/render';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';

// Detail Mode snapshots represent the post-activation sidebar.
const activatedState: SidebarState = { ...initialState, isActivated: true };

const task = (id: number, title: string, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
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
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [
        task(1, 'Main task', {
          external_id: '42',
          assignee: 'alice',
          parent_external_id: '10',
          worktree_branch: 'feature-main',
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
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'Lonely task', { external_id: '7', synced_at: '2026-04-10' })],
      descriptionsByTaskId: { 1: '' },
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail with externally-closed indicator', () => {
    const state: SidebarState = {
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'Closed task', { status: 'closed', worktree_branch: 'feat-zz', synced_at: '2026-04-10' })],
      sessions: [
        sess(10, 1, { status: 'running', worktree_path: '/wt/feat-zz' }),
        sess(11, 1, { status: 'running', worktree_path: '/wt/feat-zz' }),
      ],
      descriptionsByTaskId: { 1: '' },
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail with description, no sessions, no other tasks (#47)', () => {
    const state: SidebarState = {
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'With desc', { external_id: '8', synced_at: '2026-04-10' })],
      descriptionsByTaskId: { 1: '<p>A short description.</p>' },
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail without description, with running sessions (#47)', () => {
    const state: SidebarState = {
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [task(1, 'Running detail', { external_id: '9', synced_at: '2026-04-10' })],
      sessions: [
        sess(10, 1, { status: 'running', agent_state: 'working', tab_label: 'impl' }),
      ],
      descriptionsByTaskId: { 1: '' },
      activeTaskId: 1,
    };
    expect(render(state)).toMatchSnapshot();
  });

  it('Detail with footer mini-cards: one running, one idle (#47)', () => {
    const state: SidebarState = {
      ...activatedState,
      mode: { kind: 'detail', taskId: 1 },
      tasks: [
        task(1, 'Focus', { external_id: '1', synced_at: '2026-04-10' }),
        task(2, 'Sibling running', { external_id: '2', synced_at: '2026-04-09' }),
        task(3, 'Sibling idle', { external_id: '3', synced_at: '2026-04-08' }),
      ],
      sessions: [
        sess(20, 2, { status: 'running' }),
      ],
      descriptionsByTaskId: { 1: '' },
    };
    expect(render(state)).toMatchSnapshot();
  });
});
