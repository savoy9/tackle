import { describe, it, expect, vi } from 'vitest';
import { createEventBus, type StatusLabelMapping } from '@tackle/shared';
import type { Task } from '@tackle/shared';
import { registerLabelProjector } from '../task/label-projector';

const baseTask = (id: number, ext: string, labels: string[] = []): Task => ({
  id,
  external_id: ext,
  external_system: 'github',
  title: 't',
  description: '',
  external_status: 'open',
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: 'plan_approved',
  synced_at: '',
  created_at: '',
  // labels not part of Task interface — projector must fetch them
});

describe('registerLabelProjector', () => {
  function setup(
    tasks: Task[],
    remoteLabels: Record<string, string[]>,
    mapping?: StatusLabelMapping,
  ) {
    const bus = createEventBus();
    bus.register('task.plan_started', () => {});
    bus.register('plan.approved', () => {});
    bus.register('task.implementation_started', () => {});
    bus.register('external.status_changed', () => {});
    bus.register('phase.created', () => {});
    bus.register('phase.removed', () => {});

    const taskRepo = {
      get: async (id: number) => tasks.find((t) => t.id === id),
    };
    const fetchLabels = vi.fn(async (extId: string) => remoteLabels[extId] ?? []);
    const setLabels = vi.fn(async (_extId: string, _labels: string[]) => {});

    registerLabelProjector(bus, {
      taskRepo: taskRepo as never,
      fetchLabels,
      setLabels,
      mapping,
    });

    return { bus, fetchLabels, setLabels };
  }

  it('PATCHes labels with the canonical tackle:plan-approved when plan.approved fires', async () => {
    const { bus, setLabels } = setup([baseTask(1, '42', ['bug'])], { '42': ['bug'] });
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    // The projector is async; flush microtasks.
    await new Promise((r) => setImmediate(r));
    expect(setLabels).toHaveBeenCalledTimes(1);
    expect(setLabels.mock.calls[0][0]).toBe('42');
    const newLabels = setLabels.mock.calls[0][1] as string[];
    expect(newLabels).toContain('tackle:plan-approved');
    expect(newLabels).toContain('bug');
  });

  it('removes a stale tackle:* label when transitioning', async () => {
    const { bus, setLabels } = setup([baseTask(1, '42', [])], {
      '42': ['bug', 'tackle:plan-started'],
    });
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(setLabels).toHaveBeenCalledTimes(1);
    const newLabels = setLabels.mock.calls[0][1] as string[];
    expect(newLabels).toContain('tackle:plan-approved');
    expect(newLabels).not.toContain('tackle:plan-started');
    expect(newLabels).toContain('bug');
  });

  it('does NOT PATCH when projection is a no-op (target label already present)', async () => {
    const { bus, setLabels } = setup([baseTask(1, '42', [])], { '42': ['tackle:plan-approved'] });
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(setLabels).not.toHaveBeenCalled();
  });

  it('ignores events that do not mutate tackle_status (e.g., phase.created)', async () => {
    const { bus, setLabels } = setup([baseTask(1, '42', [])], { '42': [] });
    bus.dispatch({
      type: 'phase.created',
      task_id: 1,
      plan_id: 1,
      external_id: '101',
      name: 'P',
      sort_order: 0,
      source: 'sync',
    });
    await new Promise((r) => setImmediate(r));
    expect(setLabels).not.toHaveBeenCalled();
  });

  it('projects onto a configured custom mapping (no tackle:* prefix)', async () => {
    const teamMapping: StatusLabelMapping = {
      not_started: 'status:todo',
      plan_started: 'status:planning',
      plan_awaiting_approval: 'status:plan-review',
      plan_approved: 'status:ready',
      implementation_started: 'status:in-progress',
      in_review: 'status:in-review',
      pr_created: 'status:pr-open',
      merged: 'status:done',
    };
    const { bus, setLabels } = setup(
      [baseTask(1, '42', [])],
      { '42': ['bug', 'status:planning'] },
      teamMapping,
    );
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(setLabels).toHaveBeenCalledTimes(1);
    const newLabels = setLabels.mock.calls[0][1] as string[];
    expect(newLabels).toContain('status:ready');
    expect(newLabels).not.toContain('status:planning');
    expect(newLabels).not.toContain('tackle:plan-approved');
    expect(newLabels).toContain('bug');
  });
});
