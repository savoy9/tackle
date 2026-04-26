import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { sortTasks } from '../sidebar/sort';

const task = (id: number, updated_at: string, title = `T${id}`): Task => ({
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
  synced_at: updated_at,
  created_at: updated_at,
});

const s = (task_id: number, over: Partial<Session> = {}): Session => ({
  id: Math.random(),
  task_id,
  phase_id: null,
  name: 's',
  kind: 'implement',
  status: 'running',
  psmux_name: 'p',
  tab_label: 't',
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

describe('sortTasks', () => {
  it('puts waiting tasks first', () => {
    const t1 = task(1, '2026-01-01');
    const t2 = task(2, '2026-01-02');
    const sessionsByTask = new Map<number, Session[]>();
    sessionsByTask.set(1, [s(1, { agent_state: 'idle', status: 'running' })]);
    sessionsByTask.set(2, [s(2, { agent_state: 'waiting', status: 'running' })]);
    const sorted = sortTasks([t1, t2], sessionsByTask);
    expect(sorted.map((t) => t.id)).toEqual([2, 1]);
  });

  it('working > has-running > other', () => {
    const t1 = task(1, '2026-01-01'); // other (no sessions)
    const t2 = task(2, '2026-01-01'); // has-running
    const t3 = task(3, '2026-01-01'); // working
    const m = new Map<number, Session[]>();
    m.set(2, [s(2, { agent_state: 'idle', status: 'running' })]);
    m.set(3, [s(3, { agent_state: 'working', status: 'running' })]);
    const sorted = sortTasks([t1, t2, t3], m);
    expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
  });

  it('within same bucket, sorts by updated_at descending', () => {
    const t1 = task(1, '2026-01-01');
    const t2 = task(2, '2026-01-03');
    const t3 = task(3, '2026-01-02');
    const sorted = sortTasks([t1, t2, t3], new Map());
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate input', () => {
    const tasks = [task(1, '2026-01-01'), task(2, '2026-01-02')];
    const original = tasks.slice();
    sortTasks(tasks, new Map());
    expect(tasks).toEqual(original);
  });
});
