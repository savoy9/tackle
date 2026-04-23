import type { SessionKind } from '@tackle/shared';
import { KIND_ORDER, formatKindLabel } from './kind-icon';

export interface KindQuickPickItem {
  /** Iconified label shown in the QuickPick (e.g. `📓 plan`). */
  label: string;
  /** The underlying SessionKind, preserved for selection mapping. */
  kind: SessionKind;
}

/**
 * Build the items shown by any Tackle QuickPick that lists Session Kinds.
 * Each item's label is prefixed with the kind's glyph from KIND_ICON so the
 * picker shares the sidebar's visual vocabulary.
 */
export function buildKindQuickPickItems(): KindQuickPickItem[] {
  return KIND_ORDER.map((kind) => ({
    label: formatKindLabel(kind),
    kind,
  }));
}

/**
 * Kinds for which α-isolation (per-Session sub-worktree) makes sense.
 * Plan / review / shell don't trigger code edits worth isolating.
 */
export const IMPL_LIKE_KINDS: readonly SessionKind[] = [
  'implement', 'debug', 'test', 'pilot',
];

/**
 * Whether the New Session QuickPick should offer the "isolate in new worktree"
 * toggle for the given kind. The toggle is only meaningful when the Task
 * already has a worktree (so we have a branch to fork off of) AND the kind is
 * impl-like (a code-editing Agent that can collide with siblings).
 */
export function shouldOfferIsolation(
  kind: SessionKind,
  ctx: { taskWorktreeExists: boolean },
): boolean {
  if (!ctx.taskWorktreeExists) return false;
  return IMPL_LIKE_KINDS.includes(kind);
}

