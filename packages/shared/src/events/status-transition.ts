import type { TackleStatus } from '../index';

/**
 * Forward-only legal next-state map for `tasks.tackle_status`.
 * Re-planning surfaces new Phases; it does not regress the Task lifecycle.
 */
export const FORWARD_CHAIN: readonly TackleStatus[] = [
  'not_started',
  'plan_started',
  'plan_awaiting_approval',
  'plan_approved',
  'implementation_started',
  'in_review',
  'pr_created',
  'merged',
];

export const ORDINAL: Record<TackleStatus, number> = FORWARD_CHAIN.reduce(
  (acc, s, i) => {
    acc[s] = i;
    return acc;
  },
  {} as Record<TackleStatus, number>,
);

/**
 * A transition is legal iff `to` is the immediate successor of `from` in the
 * forward chain. Same-state self-loops, backwards transitions, and skips
 * are all rejected.
 */
export function isLegalTackleTransition(from: TackleStatus, to: TackleStatus): boolean {
  return ORDINAL[to] === ORDINAL[from] + 1;
}

/** True iff `a` is at-or-after `b` in the forward chain. */
export function isAtOrAfter(a: TackleStatus, b: TackleStatus): boolean {
  return ORDINAL[a] >= ORDINAL[b];
}
