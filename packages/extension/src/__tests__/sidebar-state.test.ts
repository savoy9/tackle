import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { reducer, initialState, type SidebarState } from '../sidebar/sidebar-state';

const task = (id: number, title: string): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  synced_at: '',
  created_at: '',
});

const session = (id: number, task_id: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id,
  phase_id: null,
  name: `s${id}`,
  kind: 'implement',
  status: 'running',
  psmux_name: `p${id}`,
  tab_label: `tab${id}`,
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

describe('sidebar reducer', () => {
  it('has a sensible initial state', () => {
    expect(initialState).toEqual({
      mode: 'list',
      tasks: [],
      sessions: [],
      activeTaskId: undefined,
      expandedCardIds: new Set<number>(),
      closedFolderOpen: false,
      descriptionsByTaskId: {},
      isActivated: false,
    });
  });

  it('setSessions replaces sessions list', () => {
    const s = reducer(initialState, {
      type: 'setSessions',
      sessions: [session(1, 10), session(2, 10)],
    });
    expect(s.sessions).toHaveLength(2);
    expect(s.sessions[0].id).toBe(1);
  });

  it('setTasks replaces task list', () => {
    const s = reducer(initialState, { type: 'setTasks', tasks: [task(1, 'A'), task(2, 'B')] });
    expect(s.tasks).toHaveLength(2);
    expect(s.tasks[0].title).toBe('A');
  });

  it('setActiveTask sets activeTaskId', () => {
    const s = reducer(initialState, { type: 'setActiveTask', taskId: 42 });
    expect(s.activeTaskId).toBe(42);
  });

  it('setActiveTask with undefined clears', () => {
    const s1 = reducer(initialState, { type: 'setActiveTask', taskId: 5 });
    const s2 = reducer(s1, { type: 'setActiveTask', taskId: undefined });
    expect(s2.activeTaskId).toBeUndefined();
  });

  it('enterDetail moves mode to detail with taskId', () => {
    const s = reducer(initialState, { type: 'enterDetail', taskId: 7 });
    expect(s.mode).toEqual({ kind: 'detail', taskId: 7 });
  });

  it('exitDetail returns mode to list', () => {
    const s1 = reducer(initialState, { type: 'enterDetail', taskId: 7 });
    const s2 = reducer(s1, { type: 'exitDetail' });
    expect(s2.mode).toBe('list');
  });

  it('toggleExpanded adds then removes id', () => {
    const s1 = reducer(initialState, { type: 'toggleExpanded', taskId: 3 });
    expect(s1.expandedCardIds.has(3)).toBe(true);
    const s2 = reducer(s1, { type: 'toggleExpanded', taskId: 3 });
    expect(s2.expandedCardIds.has(3)).toBe(false);
  });

  it('toggleExpanded does not mutate prior state', () => {
    const s1 = reducer(initialState, { type: 'toggleExpanded', taskId: 3 });
    const s2 = reducer(s1, { type: 'toggleExpanded', taskId: 4 });
    expect(s1.expandedCardIds.has(4)).toBe(false);
    expect(s2.expandedCardIds.has(3)).toBe(true);
    expect(s2.expandedCardIds.has(4)).toBe(true);
  });

  it('toggleClosedFolder flips closedFolderOpen', () => {
    const s1 = reducer(initialState, { type: 'toggleClosedFolder' });
    expect(s1.closedFolderOpen).toBe(true);
    const s2 = reducer(s1, { type: 'toggleClosedFolder' });
    expect(s2.closedFolderOpen).toBe(false);
  });

  it('returns the same state for unknown action', () => {
    // @ts-expect-error unknown action intentionally
    const s = reducer(initialState, { type: 'bogus' });
    expect(s).toBe(initialState);
  });
});

describe('SidebarState type compatibility', () => {
  it('mode can be literal list or detail object', () => {
    const list: SidebarState = initialState;
    const detail: SidebarState = { ...initialState, mode: { kind: 'detail', taskId: 1 } };
    expect(list.mode).toBe('list');
    expect(detail.mode).toEqual({ kind: 'detail', taskId: 1 });
  });
});
