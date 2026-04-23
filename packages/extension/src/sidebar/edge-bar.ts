// Edge Bar — derives the visual state of the per-card running-session
// indicator from a Task and its Sessions (#46).
//
// Three states, mutually exclusive:
//   off    — no Edge Bar element should render (Task has no running Sessions).
//   soft   — render at --tk-accent-soft (non-Active Task has running work).
//   solid  — render at --tk-accent (the Active Task has running work).
//
// Pure: no IO, no DOM, no CSS — render-card.ts maps the returned state
// to a class name. Class-name constants are exported here so downstream
// snapshots and CSS stay in sync with this module.

import type { Task, Session } from '@tackle/shared';

export type EdgeBarState = 'off' | 'soft' | 'solid';

/** Stable class-name constants. Consumed by render-card.ts and component CSS. */
export const EDGE_BAR_CLASS = 'edge-bar';
export const EDGE_BAR_OFF_CLASS = 'edge-bar--off';
export const EDGE_BAR_SOFT_CLASS = 'edge-bar--soft';
export const EDGE_BAR_SOLID_CLASS = 'edge-bar--solid';

/**
 * Derive the Edge Bar state for `task` given its `sessions` and whether the
 * Task is the currently-Active Task.
 *
 * Caller is responsible for passing only the Sessions belonging to `task`
 * (already filtered by task_id and not deleted).
 */
export function deriveEdgeBarState(
  _task: Task,
  sessions: Session[],
  isActive: boolean,
): EdgeBarState {
  const hasRunning = sessions.some((s) => s.status === 'running');
  if (!hasRunning) return 'off';
  return isActive ? 'solid' : 'soft';
}

/** Map a state to its CSS modifier class (excluding the base class). */
export function edgeBarClassFor(state: EdgeBarState): string {
  switch (state) {
    case 'soft':
      return EDGE_BAR_SOFT_CLASS;
    case 'solid':
      return EDGE_BAR_SOLID_CLASS;
    default:
      return EDGE_BAR_OFF_CLASS;
  }
}
