import { describe, it, expect } from 'vitest';
import type { Task } from '@tackle/shared';
import { isClosedStatus, partitionTasks } from '../sidebar/closed';

const task = (id: number, external_status: string): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title: `T${id}`,
  description: '',
  external_status,
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: 'not_started',
  synced_at: '2026-04-01',
  created_at: '2026-04-01',
});

describe('isClosedStatus', () => {
  it.each(['closed', 'done', 'completed', 'resolved', 'removed'])('treats %s as closed', (s) => {
    expect(isClosedStatus(s)).toBe(true);
  });

  it.each(['Closed', 'DONE', 'Completed', 'Resolved', 'ReMoved'])(
    'is case-insensitive: %s',
    (s) => {
      expect(isClosedStatus(s)).toBe(true);
    },
  );

  it.each(['open', 'in_progress', 'new', '', 'pending', 'active'])(
    'treats %s as NOT closed',
    (s) => {
      expect(isClosedStatus(s)).toBe(false);
    },
  );
});

describe('partitionTasks', () => {
  it('splits into open vs closed preserving input order within each', () => {
    const t1 = task(1, 'open');
    const t2 = task(2, 'Closed');
    const t3 = task(3, 'in_progress');
    const t4 = task(4, 'done');
    const { open, closed } = partitionTasks([t1, t2, t3, t4]);
    expect(open.map((t) => t.id)).toEqual([1, 3]);
    expect(closed.map((t) => t.id)).toEqual([2, 4]);
  });

  it('does not mutate input', () => {
    const tasks = [task(1, 'open'), task(2, 'closed')];
    const copy = tasks.slice();
    partitionTasks(tasks);
    expect(tasks).toEqual(copy);
  });
});
