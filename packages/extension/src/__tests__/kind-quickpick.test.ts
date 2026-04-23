import { describe, it, expect } from 'vitest';
import type { SessionKind } from '@tackle/shared';
import { KIND_ICON, formatKindLabel } from '../session/kind-icon';
import { buildKindQuickPickItems } from '../session/pick-kind';

describe('KIND_ICON', () => {
  it('has a glyph for every SessionKind', () => {
    const expected: Record<SessionKind, string> = {
      plan: '📓',
      implement: '⌨️',
      review: '👁',
      debug: '🐞',
      test: '🧪',
      pilot: '🚀',
      shell: '💻',
    };
    for (const k of Object.keys(expected) as SessionKind[]) {
      expect(KIND_ICON[k]).toBe(expected[k]);
    }
  });
});

describe('formatKindLabel', () => {
  it('prefixes the kind with its icon and a space', () => {
    expect(formatKindLabel('plan')).toBe('📓 plan');
    expect(formatKindLabel('implement')).toBe('⌨️ implement');
    expect(formatKindLabel('shell')).toBe('💻 shell');
  });
});

describe('buildKindQuickPickItems', () => {
  it('returns one item per SessionKind in canonical order', () => {
    const items = buildKindQuickPickItems();
    expect(items.map(i => i.kind)).toEqual([
      'plan', 'implement', 'review', 'debug', 'test', 'pilot', 'shell',
    ]);
  });

  it('every item label is iconified via KIND_ICON', () => {
    const items = buildKindQuickPickItems();
    for (const item of items) {
      expect(item.label).toBe(`${KIND_ICON[item.kind]} ${item.kind}`);
    }
  });

  it('emits the documented glyphs for each kind', () => {
    const items = buildKindQuickPickItems();
    const byKind = Object.fromEntries(items.map(i => [i.kind, i.label]));
    expect(byKind.plan).toBe('📓 plan');
    expect(byKind.implement).toBe('⌨️ implement');
    expect(byKind.review).toBe('👁 review');
    expect(byKind.debug).toBe('🐞 debug');
    expect(byKind.test).toBe('🧪 test');
    expect(byKind.pilot).toBe('🚀 pilot');
    expect(byKind.shell).toBe('💻 shell');
  });
});
