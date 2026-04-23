// Session Row primitive (#47).
//
// A Session Row is the per-session display used in two distinct surfaces:
//
//   • list-expanded — rendered under an expanded Task Card in List Mode.
//     Action buttons (Stop, Mark Done, overflow) are ALWAYS visible — these
//     rows are themselves a hover-revealed surface, so further hover-gating
//     would require a second hover the user can't predict.
//
//   • detail — rendered inside the Detail Mode Sessions section. The detail
//     surface is permanently expanded, so the row keeps its action buttons
//     hidden by default and fades them in on row hover (120ms ease-out per
//     visual identity §6, instant under prefers-reduced-motion).
//
// The visibility difference is encoded as a CSS modifier class on the row
// element (SESSION_ROW_DETAIL_CLASS) so component CSS can express the rule
// declaratively. Pure HTML structure does not change between surfaces.

import type { Session } from '@tackle/shared';
import { sessionGlyph } from './glyph';
import { KIND_ICON } from '../session/kind-icon';

/** Where the session row is being rendered. */
export type SessionRowSurface = 'list-expanded' | 'detail';

export interface RenderSessionRowOptions {
  /** Default 'list-expanded' for backwards compatibility. */
  surface?: SessionRowSurface;
}

/** Modifier class applied to Detail Mode session rows so CSS can hover-reveal actions. */
export const SESSION_ROW_DETAIL_CLASS = 'session-row--detail';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSessionRow(
  sess: Session,
  opts: RenderSessionRowOptions = {},
): string {
  const surface = opts.surface ?? 'list-expanded';
  const glyph = sessionGlyph(sess);
  const kind = KIND_ICON[sess.kind];
  const label = escapeHtml(sess.tab_label || sess.name);
  const classes = ['session-row'];
  if (surface === 'detail') classes.push(SESSION_ROW_DETAIL_CLASS);
  const cls = classes.join(' ');
  return `<div class="${cls}" data-action="focusSession" data-session-id="${sess.id}">
  <span class="kind">${kind}</span>
  <span class="label">${label}</span>
  <span class="glyph">${glyph}</span>
  <button class="icon-btn stop" title="Stop" data-action="stopSession" data-session-id="${sess.id}">⏹</button>
  <button class="icon-btn done" title="Mark Done" data-action="markSessionDone" data-session-id="${sess.id}">✓</button>
  <button class="icon-btn overflow" title="More" data-action="sessionOverflow" data-session-id="${sess.id}">⋯</button>
</div>`;
}

export function renderSessionRows(
  sessions: Session[],
  opts: RenderSessionRowOptions = {},
): string {
  const active = sessions.filter((s) => s.status === 'running');
  const inactive = sessions.filter((s) => s.status !== 'running');
  const parts: string[] = [];
  parts.push(`<div class="session-rows">`);
  for (const s of active) parts.push(renderSessionRow(s, opts));
  if (inactive.length > 0) {
    parts.push(`<div class="session-divider"></div>`);
  }
  for (const s of inactive) parts.push(renderSessionRow(s, opts));
  parts.push(`</div>`);
  return parts.join('');
}
