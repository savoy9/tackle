import { describe, it, expect } from 'vitest';
import { computeLabelProjection } from '../label-projection';

describe('computeLabelProjection', () => {
  it('adds the tackle:plan-approved label when target is plan_approved and label is absent', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug'],
      target: 'plan_approved',
    });
    expect(result).toEqual({ add: ['tackle:plan-approved'], remove: [] });
  });

  it('removes a stale tackle:* label when transitioning to a new status', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'tackle:plan-started'],
      target: 'plan_approved',
    });
    expect(result.add).toEqual(['tackle:plan-approved']);
    expect(result.remove).toEqual(['tackle:plan-started']);
  });

  it('is a no-op when the target label already matches and no stale labels exist', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'tackle:plan-approved'],
      target: 'plan_approved',
    });
    expect(result).toEqual({ add: [], remove: [] });
  });

  it('removes ALL stale tackle:* labels (multi-label cleanup)', () => {
    const result = computeLabelProjection({
      currentLabels: ['tackle:not-started', 'tackle:plan-started'],
      target: 'plan_approved',
    });
    expect(result.add).toEqual(['tackle:plan-approved']);
    expect(new Set(result.remove)).toEqual(
      new Set(['tackle:not-started', 'tackle:plan-started']),
    );
  });

  it('does not touch non-tackle labels', () => {
    const result = computeLabelProjection({
      currentLabels: ['bug', 'help wanted', 'priority:high'],
      target: 'plan_approved',
    });
    expect(result.remove).toEqual([]);
    expect(result.add).toEqual(['tackle:plan-approved']);
  });
});
