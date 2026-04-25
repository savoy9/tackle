/**
 * Synchronous in-process Event Bus.
 *
 * The sole writer of `tasks.tackle_status`, `tasks.external_status`, and
 * `phases.status`. Every status mutation flows through `dispatch()` so that
 * downstream effects (audit logging, label projection, webview refresh,
 * auto-spawn, notifications) hang off a single seam.
 *
 * Synchronous, same-tick, in-process — see ADR-0013.
 */

export type EventSource = 'sync' | 'cli' | 'ui' | 'skill';

export interface TaskPlanStartedEvent {
  type: 'task.plan_started';
  task_id: number;
  source: EventSource;
}

export interface ExternalStatusChangedEvent {
  type: 'external.status_changed';
  task_id: number;
  to: string;
  source: EventSource;
}

/** Discriminated union; expand as new events come online. */
export type TackleEvent = TaskPlanStartedEvent | ExternalStatusChangedEvent;

/**
 * Handlers may return `false` to signal "no-op, don't fire refresh listeners"
 * (used by idempotent handlers like external.status_changed). Returning
 * `true` or `undefined` triggers refresh as normal.
 */
export type Handler<E extends TackleEvent = TackleEvent> = (event: E) => boolean | void;

export interface EventBus {
  register<T extends TackleEvent['type']>(
    type: T,
    handler: Handler<Extract<TackleEvent, { type: T }>>,
  ): void;
  dispatch(event: TackleEvent): void;
  onRefresh(listener: () => void): void;
}

export function createEventBus(): EventBus {
  const handlers = new Map<TackleEvent['type'], Handler>();
  const refreshListeners: Array<() => void> = [];

  return {
    register(type, handler) {
      handlers.set(type, handler as Handler);
    },
    dispatch(event) {
      const handler = handlers.get(event.type);
      if (!handler) {
        throw new Error(`EventBus: no handler registered for event type "${event.type}"`);
      }
      const mutated = handler(event);
      if (mutated !== false) {
        for (const l of refreshListeners) l();
      }
    },
    onRefresh(listener) {
      refreshListeners.push(listener);
    },
  };
}
