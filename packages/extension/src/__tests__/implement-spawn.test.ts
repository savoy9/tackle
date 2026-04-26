import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '@tackle/shared';
import type { Phase } from '@tackle/shared';
import { phasesToImplement, registerImplementSpawner } from '../task/implement-spawn';

const phase = (over: Partial<Phase> = {}): Phase => ({
  id: 1,
  plan_id: 1,
  task_id: 1,
  external_id: '101',
  name: 'P',
  description: '',
  status: 'pending',
  sort_order: 0,
  created_at: '',
  ...over,
});

describe('phasesToImplement', () => {
  it('returns only pending phases for the given task', () => {
    const phases = [
      phase({ id: 1, status: 'pending', sort_order: 0 }),
      phase({ id: 2, status: 'in_progress', sort_order: 1 }),
      phase({ id: 3, status: 'done', sort_order: 2 }),
      phase({ id: 4, status: 'failed', sort_order: 3 }),
    ];
    const result = phasesToImplement(phases, 1);
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it('returns phases in sort_order ascending', () => {
    const phases = [
      phase({ id: 3, status: 'pending', sort_order: 2 }),
      phase({ id: 1, status: 'pending', sort_order: 0 }),
      phase({ id: 2, status: 'pending', sort_order: 1 }),
    ];
    const result = phasesToImplement(phases, 1);
    expect(result.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('ignores phases for other tasks', () => {
    const phases = [
      phase({ id: 1, task_id: 1, status: 'pending', sort_order: 0 }),
      phase({ id: 2, task_id: 2, status: 'pending', sort_order: 0 }),
    ];
    expect(phasesToImplement(phases, 1).map((p) => p.id)).toEqual([1]);
  });

  it('returns [] when no pending phases exist', () => {
    expect(phasesToImplement([phase({ status: 'done' })], 1)).toEqual([]);
  });
});

describe('registerImplementSpawner', () => {
  function setupBus(phases: Phase[]) {
    const bus = createEventBus();
    bus.register('task.implementation_started', () => {});
    const spawn = vi.fn(async (_taskId: number, _phaseId: number) => {});
    const phasesRepo = {
      listForPlan: async () => phases as never,
    };
    const plansRepo = {
      get: async (_taskId: number) => ({ id: 1, task_id: 1 }) as never,
    };
    registerImplementSpawner(bus, {
      plansRepo: plansRepo as never,
      phasesRepo: phasesRepo as never,
      spawn,
    });
    return { bus, spawn };
  }

  it('spawns one implement Session per pending phase when task.implementation_started fires', async () => {
    const { bus, spawn } = setupBus([
      phase({ id: 10, status: 'pending', sort_order: 0 }),
      phase({ id: 11, status: 'pending', sort_order: 1 }),
      phase({ id: 12, status: 'done', sort_order: 2 }),
    ]);
    bus.dispatch({ type: 'task.implementation_started', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls.map((c) => c[1])).toEqual([10, 11]);
  });

  it('spawns nothing when there are no pending phases', async () => {
    const { bus, spawn } = setupBus([
      phase({ id: 10, status: 'done', sort_order: 0 }),
      phase({ id: 11, status: 'in_progress', sort_order: 1 }),
    ]);
    bus.dispatch({ type: 'task.implementation_started', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(spawn).not.toHaveBeenCalled();
  });

  it('ignores other event types', async () => {
    const { bus, spawn } = setupBus([phase({ id: 10, status: 'pending' })]);
    bus.register('plan.approved', () => {});
    bus.dispatch({ type: 'plan.approved', task_id: 1, source: 'ui' });
    await new Promise((r) => setImmediate(r));
    expect(spawn).not.toHaveBeenCalled();
  });
});
