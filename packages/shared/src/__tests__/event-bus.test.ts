import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../events/event-bus';
import type { TackleEvent } from '../events/event-bus';

describe('EventBus', () => {
  it('dispatch invokes the registered handler synchronously', () => {
    const bus = createEventBus();
    const seen: TackleEvent[] = [];
    bus.register('task.plan_started', (e) => {
      seen.push(e);
    });

    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });

    // Synchronous: handler ran before dispatch returned.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'task.plan_started', task_id: 1, source: 'ui' });
  });

  it('throws when no handler is registered for an event type', () => {
    const bus = createEventBus();
    expect(() =>
      bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' }),
    ).toThrow(/no handler/i);
  });

  it('only the registered handler runs (event types are routed)', () => {
    const bus = createEventBus();
    const planHandler = vi.fn();
    bus.register('task.plan_started', planHandler);
    bus.dispatch({ type: 'task.plan_started', task_id: 7, source: 'ui' });
    expect(planHandler).toHaveBeenCalledTimes(1);
  });

  it('emits a refresh signal after handler returns', () => {
    const bus = createEventBus();
    bus.register('task.plan_started', () => {
      // no-op
    });
    const listener = vi.fn();
    bus.onRefresh(listener);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('onMutation listeners receive the event after the handler runs (success)', () => {
    const bus = createEventBus();
    bus.register('task.plan_started', () => {
      // no-op
    });
    const seen: TackleEvent[] = [];
    bus.onMutation((e) => seen.push(e));
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'task.plan_started', task_id: 1 });
  });

  it('onMutation listeners are NOT called when the handler signals no-op (returns false)', () => {
    const bus = createEventBus();
    bus.register('task.plan_started', () => false);
    const listener = vi.fn();
    bus.onMutation(listener);
    bus.dispatch({ type: 'task.plan_started', task_id: 1, source: 'ui' });
    expect(listener).not.toHaveBeenCalled();
  });
});
