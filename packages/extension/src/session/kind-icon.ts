import type { SessionKind } from '@tackle/shared';

/**
 * Single source of truth for the glyph used to represent each Session Kind.
 * Used by both the sidebar render code and any QuickPick that lists Session Kinds,
 * so the picker shares its visual vocabulary with the sidebar.
 */
export const KIND_ICON: Record<SessionKind, string> = {
  plan: '📓',
  implement: '⌨️',
  review: '👁',
  debug: '🐞',
  test: '🧪',
  pilot: '🚀',
  shell: '💻',
};

/** Canonical order in which Session Kinds are presented to users. */
export const KIND_ORDER: readonly SessionKind[] = [
  'plan',
  'implement',
  'review',
  'debug',
  'test',
  'pilot',
  'shell',
];

/** Render a kind label as `<icon> <kind>`. */
export function formatKindLabel(kind: SessionKind): string {
  return `${KIND_ICON[kind]} ${kind}`;
}
