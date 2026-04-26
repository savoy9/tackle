import { describe, it, expect } from 'vitest';
import {
  computePhaseDiscoveryEvents,
  type ExternalChildItem,
  type LocalPhaseSnapshot,
} from '../plan-discovery';

const localPhase = (over: Partial<LocalPhaseSnapshot> = {}): LocalPhaseSnapshot => ({
  id: 1,
  task_id: 1,
  plan_id: 1,
  external_id: '101',
  name: 'P1',
  sort_order: 0,
  ...over,
});

const child = (over: Partial<ExternalChildItem> = {}): ExternalChildItem => ({
  external_id: '101',
  title: 'P1',
  sort_order: 0,
  ...over,
});

describe('computePhaseDiscoveryEvents', () => {
  it('returns no events when local mirror matches external children exactly', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [localPhase()],
      incoming: [child()],
      source: 'sync',
    });
    expect(result.events).toEqual([]);
  });

  it('emits phase.created for each external child not in local', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [],
      incoming: [
        child({ external_id: '101', title: 'A', sort_order: 0 }),
        child({ external_id: '102', title: 'B', sort_order: 1 }),
      ],
      source: 'sync',
    });
    expect(result.events).toEqual([
      {
        type: 'phase.created',
        task_id: 1,
        plan_id: 1,
        external_id: '101',
        name: 'A',
        sort_order: 0,
        source: 'sync',
      },
      {
        type: 'phase.created',
        task_id: 1,
        plan_id: 1,
        external_id: '102',
        name: 'B',
        sort_order: 1,
        source: 'sync',
      },
    ]);
  });

  it('emits phase.removed for each local phase not in incoming', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [
        localPhase({ id: 1, external_id: '101' }),
        localPhase({ id: 2, external_id: '102' }),
      ],
      incoming: [child({ external_id: '102' })],
      source: 'sync',
    });
    expect(result.events).toEqual([
      { type: 'phase.removed', task_id: 1, external_id: '101', source: 'sync' },
    ]);
  });

  it('emits both created and removed in one pass', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [localPhase({ external_id: '101' })],
      incoming: [child({ external_id: '202', title: 'New' })],
      source: 'sync',
    });
    expect(result.events.map((e) => e.type)).toEqual(['phase.created', 'phase.removed']);
  });

  it('returns title/sort_order updates for matched phases (caller upserts directly)', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [localPhase({ id: 7, external_id: '101', name: 'old', sort_order: 5 })],
      incoming: [child({ external_id: '101', title: 'new', sort_order: 2 })],
      source: 'sync',
    });
    expect(result.events).toEqual([]);
    expect(result.upserts).toEqual([
      { phase_id: 7, name: 'new', sort_order: 2 },
    ]);
  });

  it('does not emit upserts when title and sort_order are unchanged', () => {
    const result = computePhaseDiscoveryEvents({
      task_id: 1,
      plan_id: 1,
      local: [localPhase()],
      incoming: [child()],
      source: 'sync',
    });
    expect(result.upserts).toEqual([]);
  });
});
