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
