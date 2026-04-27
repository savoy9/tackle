import { describe, it, expect } from 'vitest';
import {
  computeLabelProjection,
  resolveStatusFromLabels,
  DEFAULT_TACKLE_LABEL_MAPPING,
  type StatusLabelMapping,
} from '../label-projection';

// Team that already has `status:*` labels — Tackle should adopt them
// rather than create parallel `tackle:*` duplicates.
const TEAM_MAPPING: StatusLabelMapping = {
  not_started: 'status:todo',
  plan_started: 'status:planning',
  plan_awaiting_approval: 'status:plan-review',
  plan_approved: 'status:ready',
  implementation_started: 'status:in-progress',
  in_review: 'status:in-review',
  pr_created: 'status:pr-open',
  merged: 'status:done',
};

describe('computeLabelProjection (default mapping)', () => {
  const mapping = DEFAULT_TACKLE_LABEL_MAPPING;

  it('adds the tackle:plan-approved label when target is plan_approved and label is absent', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug'],
      target: 'plan_approved',
      mapping,
    });
    expect(result).toEqual({ add: ['tackle:plan-approved'], remove: [] });
  });

  it('removes a stale tackle:* label when transitioning to a new status', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'tackle:plan-started'],
      target: 'plan_approved',
      mapping,
    });
    expect(result.add).toEqual(['tackle:plan-approved']);
    expect(result.remove).toEqual(['tackle:plan-started']);
  });

  it('is a no-op when the target label already matches and no stale labels exist', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'tackle:plan-approved'],
      target: 'plan_approved',
      mapping,
    });
    expect(result).toEqual({ add: [], remove: [] });
  });

  it('removes ALL stale tackle:* labels (multi-label cleanup)', () => {
    const result = computeLabelProjection({
      currentLabels: ['tackle:not-started', 'tackle:plan-started'],
      target: 'plan_approved',
      mapping,
    });
    expect(result.add).toEqual(['tackle:plan-approved']);
    expect(new Set(result.remove)).toEqual(new Set(['tackle:not-started', 'tackle:plan-started']));
  });

  it('does not touch non-tackle labels', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'help wanted', 'priority:high'],
      target: 'plan_approved',
      mapping,
    });
    expect(result.remove).toEqual([]);
    expect(result.add).toEqual(['tackle:plan-approved']);
  });
});

describe('computeLabelProjection (custom mapping)', () => {
  it('projects onto configured labels rather than tackle:* defaults', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug'],
      target: 'in_review',
      mapping: TEAM_MAPPING,
    });
    expect(result).toEqual({ add: ['status:in-review'], remove: [] });
  });

  it('removes only configured labels — leaves unrelated tackle:* labels alone', () => {
    // A `tackle:*` label is NOT in the configured mapping, so the projector
    // must not touch it (the team explicitly opted out of that namespace).
    const result = computeLabelProjection({
      currentLabels: ['status:planning', 'tackle:something-unrelated'],
      target: 'in_review',
      mapping: TEAM_MAPPING,
    });
    expect(result.add).toEqual(['status:in-review']);
    expect(result.remove).toEqual(['status:planning']);
  });
});

describe('resolveStatusFromLabels (mutex-on-sync)', () => {
  const mapping = DEFAULT_TACKLE_LABEL_MAPPING;

  it('returns null when no configured status labels are present', () => {
    expect(resolveStatusFromLabels(['bug', 'help wanted'], mapping)).toBeNull();
  });

  it('returns the corresponding status when exactly one configured label is present', () => {
    expect(resolveStatusFromLabels(['bug', 'tackle:plan-approved'], mapping)).toBe('plan_approved');
  });

  it('returns the most-advanced status when multiple configured labels coexist', () => {
    // Race: Tackle's "remove old, add new" interleaved with a manual edit
    // leaves both labels on the issue. The more-advanced state wins so the
    // local DB converges forward, never backward.
    expect(
      resolveStatusFromLabels(
        ['tackle:plan-started', 'tackle:in-review', 'tackle:plan-approved'],
        mapping,
      ),
    ).toBe('in_review');
  });

  it('respects the configured custom mapping when resolving', () => {
    expect(
      resolveStatusFromLabels(['status:planning', 'status:in-progress', 'unrelated'], TEAM_MAPPING),
    ).toBe('implementation_started');
  });

  it('ignores labels not in the configured mapping', () => {
    // A `tackle:*` label is NOT in this team's mapping — it must not
    // influence resolution.
    expect(resolveStatusFromLabels(['tackle:merged', 'status:planning'], TEAM_MAPPING)).toBe(
      'plan_started',
    );
  });
});
