import { describe, it, expect } from 'vitest';
import { isLegalTackleTransition } from '../events/status-transition';
import type { TackleStatus } from '../index';

describe('isLegalTackleTransition', () => {
  const all: TackleStatus[] = [
    'not_started',
    'plan_started',
    'plan_awaiting_approval',
    'plan_approved',
    'implementation_started',
    'in_review',
    'pr_created',
    'merged',
  ];

  it('allows the canonical forward chain', () => {
    for (let i = 0; i < all.length - 1; i++) {
      expect(isLegalTackleTransition(all[i], all[i + 1])).toBe(true);
    }
  });

  it('rejects backwards transitions', () => {
    expect(isLegalTackleTransition('plan_started', 'not_started')).toBe(false);
    expect(isLegalTackleTransition('merged', 'in_review')).toBe(false);
  });

  it('rejects same-state transitions (no self-loops)', () => {
    for (const s of all) {
      expect(isLegalTackleTransition(s, s)).toBe(false);
    }
  });

  it('rejects skipping straight from not_started to plan_approved', () => {
    expect(isLegalTackleTransition('not_started', 'plan_approved')).toBe(false);
  });
});
