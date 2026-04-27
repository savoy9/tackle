// Bidirectional sync: project local Tackle Status onto GitHub labels (#80).
//
// Per-repo configurable label namespace per ADR-0013 / #85: Tackle owns the
// status workflow but adopts whatever label vocabulary the repo already uses;
// the `tackle:*` prefix is just the fallback when no team convention exists.

import type { TackleStatus } from './index';
import { FORWARD_CHAIN, ORDINAL } from './events/status-transition';

/** Per-status label name, configured per-repo (#85, ADR-0013). */
export type StatusLabelMapping = Record<TackleStatus, string>;

/**
 * Default fallback mapping using the reserved `tackle:` prefix.
 * Used when a repo has no `.tackle/config.json` mapping configured.
 */
export const DEFAULT_TACKLE_LABEL_MAPPING: StatusLabelMapping = {
  not_started: 'tackle:not-started',
  plan_started: 'tackle:plan-started',
  plan_awaiting_approval: 'tackle:plan-awaiting-approval',
  plan_approved: 'tackle:plan-approved',
  implementation_started: 'tackle:implementation-started',
  in_review: 'tackle:in-review',
  pr_created: 'tackle:pr-created',
  merged: 'tackle:merged',
};

export interface LabelProjectionInput {
  currentLabels: string[];
  target: TackleStatus;
  mapping: StatusLabelMapping;
}

export interface LabelProjectionOutput {
  add: string[];
  remove: string[];
}

export function computeLabelProjection(input: LabelProjectionInput): LabelProjectionOutput {
  const { currentLabels, target, mapping } = input;
  const targetLabel = mapping[target];
  const managed: ReadonlySet<string> = new Set(Object.values(mapping));
  const current = new Set(currentLabels);

  const add: string[] = [];
  if (!current.has(targetLabel)) add.push(targetLabel);

  const remove: string[] = [];
  for (const l of currentLabels) {
    if (l !== targetLabel && managed.has(l)) remove.push(l);
  }

  return { add, remove };
}

/**
 * Mutex-on-sync (ADR-0013, #85): when an issue carries multiple configured
 * status labels (race between Tackle's two-call "remove old, add new" and a
 * teammate's manual edit), the most-advanced state wins so local DB
 * converges forward, never backward. Returns null if none present.
 */
export function resolveStatusFromLabels(
  currentLabels: string[],
  mapping: StatusLabelMapping,
): TackleStatus | null {
  const labelToStatus = new Map<string, TackleStatus>();
  for (const status of FORWARD_CHAIN) {
    labelToStatus.set(mapping[status], status);
  }

  let winner: TackleStatus | null = null;
  let winnerRank = -1;
  for (const l of currentLabels) {
    const status = labelToStatus.get(l);
    if (!status) continue;
    const rank = ORDINAL[status];
    if (rank > winnerRank) {
      winner = status;
      winnerRank = rank;
    }
  }
  return winner;
}
