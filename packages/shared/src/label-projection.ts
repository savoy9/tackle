// Bidirectional sync: project local Tackle Status onto GitHub labels (#80).
//
// Each Tackle Status maps to a single canonical `tackle:*` label. Local
// status mutations are projected onto the issue's label set: the canonical
// label for the new status is added, and any *other* `tackle:*` labels are
// removed (so an issue carries exactly one Tackle label at a time).
//
// Pure function — no HTTP, no IO. The caller fetches the current label set
// and applies the returned add/remove list via the GitHub API.

import type { TackleStatus } from './index';

/** Canonical GH label for each Tackle Status. */
export const TACKLE_LABEL_BY_STATUS: Record<TackleStatus, string> = {
  not_started: 'tackle:not-started',
  plan_started: 'tackle:plan-started',
  plan_awaiting_approval: 'tackle:plan-awaiting-approval',
  plan_approved: 'tackle:plan-approved',
  implementation_started: 'tackle:implementation-started',
  in_review: 'tackle:in-review',
  pr_created: 'tackle:pr-created',
  merged: 'tackle:merged',
};

/** All Tackle-managed labels (so we can detect / clean up stale ones). */
const ALL_TACKLE_LABELS: ReadonlySet<string> = new Set(Object.values(TACKLE_LABEL_BY_STATUS));

export interface LabelProjectionInput {
  currentLabels: string[];
  target: TackleStatus;
}

export interface LabelProjectionOutput {
  add: string[];
  remove: string[];
}

export function computeLabelProjection(input: LabelProjectionInput): LabelProjectionOutput {
  const targetLabel = TACKLE_LABEL_BY_STATUS[input.target];
  const current = new Set(input.currentLabels);

  const add: string[] = [];
  if (!current.has(targetLabel)) add.push(targetLabel);

  const remove: string[] = [];
  for (const l of input.currentLabels) {
    if (l !== targetLabel && ALL_TACKLE_LABELS.has(l)) remove.push(l);
  }

  return { add, remove };
}
