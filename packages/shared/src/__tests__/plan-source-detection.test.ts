import { describe, it, expect } from 'vitest';
import { detectPlanSource } from '../plan-source-detection';

describe('detectPlanSource', () => {
  it('returns markdown source when plans/{external_id}-*.md exists', () => {
    const result = detectPlanSource({
      external_id: '42',
      planFiles: ['42-foo.md', '99-bar.md'],
    });
    expect(result).toEqual({ source_kind: 'markdown', source_ref: 'plans/42-foo.md' });
  });

  it('falls back to issue_body when no plan file exists for the external_id', () => {
    const result = detectPlanSource({
      external_id: '42',
      planFiles: ['99-bar.md'],
    });
    expect(result).toEqual({ source_kind: 'issue_body', source_ref: null });
  });

  it('does NOT match a different external_id with the same prefix digit (42 vs 421)', () => {
    const result = detectPlanSource({
      external_id: '42',
      planFiles: ['421-other.md'],
    });
    expect(result).toEqual({ source_kind: 'issue_body', source_ref: null });
  });

  it('ignores non-.md files matching the prefix', () => {
    const result = detectPlanSource({
      external_id: '42',
      planFiles: ['42-foo.txt', '42-bar.json'],
    });
    expect(result).toEqual({ source_kind: 'issue_body', source_ref: null });
  });

  it('matches the bare {external_id}.md without a slug', () => {
    const result = detectPlanSource({
      external_id: '42',
      planFiles: ['42.md'],
    });
    expect(result).toEqual({ source_kind: 'markdown', source_ref: 'plans/42.md' });
  });
});
