// Top-level render module. Composes the sub-render modules and prepends the
// design-token stylesheet (THEME_CSS) and the sidebar's component CSS.
//
// Component CSS rule (#45): use var(--tk-*) for color/elevation/radius.
// `var(--vscode-*)` is permitted for font family/size and as a fallback
// inside the HC token blocks (--vscode-contrastBorder). No inline hex.

import type { SidebarState } from './sidebar-state';
import { sortTasks } from './sort';
import { partitionTasks } from './closed';
import { THEME_CSS } from './theme';
import {
  escapeHtml,
  renderCard,
  sessionsByTask,
} from './render-card';
import { renderDetail } from './render-detail';

// Re-export for any external import sites that still reference the old module.
export { renderSessionRow } from './render-session-row';

const COMPONENT_CSS = `
  body {
    color: var(--tk-fg);
    background: var(--tk-bg);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin: 0;
    padding: 0;
  }
  .tackle-empty { padding: 12px; color: var(--tk-fg-muted); }
  .card-list { list-style: none; margin: 0; padding: 0; }

  /* Idle Task Card primitive (#45):
     rounded 5 px corners, 1 px stroke, --tk-card-bg fill,
     4 px padding, 3 px gap. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--tk-gap-card);
    padding: var(--tk-pad-card);
    margin: var(--tk-pad-card);
    background: var(--tk-card-bg);
    border: var(--tk-stroke-width) solid var(--tk-stroke);
    border-radius: var(--tk-radius-card);
    cursor: pointer;
    color: var(--tk-fg);
    transition:
      background-color var(--tk-dur-hover) var(--tk-ease),
      transform var(--tk-dur-active) var(--tk-ease),
      box-shadow var(--tk-dur-active) var(--tk-ease),
      border-color var(--tk-dur-active) var(--tk-ease);
  }
  /* Hover: subtle bg tint, no lift. (#46) */
  .card:hover, .card.card--hover {
    background: var(--tk-card-bg-hover);
  }
  /* Active card (#46): lift + shadow + accent stroke + fill bump. */
  .card.card--active {
    transform: translateY(-1px);
    box-shadow: var(--tk-shadow-active);
    border-color: var(--tk-accent);
    background: var(--tk-card-bg-active);
  }
  /* Closed Folder rows (#46): sunken treatment, no stroke, inset shadow,
     reduced glyph/meta opacity. Rendered as .closed-row.card--closed. */
  .card--closed {
    background: var(--tk-card-bg-closed);
    border: none;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .card--closed .glyph, .card--closed .id, .card--closed .date {
    opacity: 0.6;
  }

  /* Edge Bar (#46): inset 1 px from card stroke so the rounded corner does
     not clip a hard 3 px rectangle. Sits at the left edge of card padding. */
  .edge-bar {
    position: absolute;
    left: 1px;
    top: 1px;
    bottom: 1px;
    width: 3px;
    border-radius: 2px;
    pointer-events: none;
  }
  .edge-bar--soft { background: var(--tk-accent-soft); }
  .edge-bar--solid { background: var(--tk-accent); }
  .edge-bar--off { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
  }
  .card .line { display: flex; align-items: center; gap: var(--tk-gap-card); min-height: 18px; }
  .card .line1 .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .card .line1 .activate, .card .line1 .overflow { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 0 4px; }
  .card .ext-icon { color: var(--tk-fg-muted); font-size: 0.85em; }
  .card .id { color: var(--tk-fg-muted); }
  .card .parent { color: var(--tk-fg-muted); font-size: 0.85em; }
  .card .rollup { color: var(--tk-fg-muted); }
  .card .branch { color: var(--tk-fg-muted); font-size: 0.85em; }
  .card .new-session { color: var(--tk-accent); cursor: pointer; }

  /* Session Row primitive (#47).
     Surface variants:
       .session-row              — list-expanded (default). Action buttons
                                   are always visible.
       .session-row--detail      — Detail Mode. Action buttons are hidden by
                                   default and fade in on row hover (120 ms
                                   ease-out per visual identity §6).
     Inside Detail Mode the row is a pill: 12 px radius, full-width, 4x10
     padding. */
  .session-rows { padding: 0 10px 6px 24px; }
  .session-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; }
  .session-row .label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .icon-btn { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 0 3px; }
  .session-divider { height: 1px; background: var(--tk-stroke-muted); margin: 4px 0; opacity: 0.6; }

  /* Detail Mode session row pill (#47). */
  .session-row--detail {
    border-radius: 12px;
    width: 100%;
    padding: 4px 10px;
    box-sizing: border-box;
  }
  /* Hide actions by default in Detail Mode; fade in on row hover. */
  .session-row--detail .icon-btn {
    opacity: 0;
    transition: opacity var(--tk-dur-hover) var(--tk-ease);
  }
  .session-row--detail:hover .icon-btn,
  .session-row--detail:focus-within .icon-btn {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .session-row--detail .icon-btn { transition: none; }
  }

  .list-header { padding: 6px 12px; color: var(--tk-fg-muted); font-size: 0.9em; }
  .closed-folder { padding: 6px 12px; cursor: pointer; color: var(--tk-fg-muted); user-select: none; }
  .closed-rows { padding: 0 12px 6px 24px; }
  .closed-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--tk-fg); }
  .closed-row .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; }
  .closed-row .id { color: var(--tk-fg-muted); }
  .closed-row .date { color: var(--tk-fg-muted); font-size: 0.85em; }

  /* Detail Mode (#47): the entire surface is one expanded Active card.
     Sections are separated by whitespace ONLY — no internal border or
     border-top rules. */
  .tackle-detail {
    /* Override card defaults that don't make sense for the full-surface card. */
    margin: 8px;
    padding: 10px 12px;
    gap: 6px;
    box-sizing: border-box;
    cursor: default;
  }
  .detail-header { display: flex; align-items: center; gap: 6px; }
  .detail-back { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-title { flex: 1 1 auto; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-overflow { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-breadcrumb { color: var(--tk-fg-muted); font-size: 0.85em; }
  .detail-identity { display: flex; gap: 6px; align-items: center; color: var(--tk-fg-muted); font-size: 0.9em; }
  .detail-branch { color: var(--tk-fg-muted); font-size: 0.85em; }
  .detail-branch-empty { color: var(--tk-fg-muted); font-style: italic; opacity: 0.8; }
  .detail-closed-indicator { color: var(--tk-fg-muted); font-style: italic; font-size: 0.85em; }

  /* Description area (#47): inset surface inside the Detail card.
     8 px x 10 px padding, 4 px radius, 40 vh max height with internal scroll. */
  .detail-description {
    background: var(--tk-description-bg);
    padding: 8px 10px;
    border-radius: 4px;
    max-height: 40vh;
    overflow-y: auto;
  }
  .detail-description img { max-width: 100%; height: auto; }
  .detail-description pre { overflow-x: auto; }

  .detail-sessions { display: flex; flex-direction: column; gap: 4px; }
  .detail-sessions-header { display: flex; align-items: center; gap: 6px; }
  .detail-sessions-add { background: transparent; color: var(--tk-accent); border: none; cursor: pointer; padding: 0 4px; font-size: 1.1em; }
  .detail-sessions-empty { color: var(--tk-fg-muted); padding: 4px; font-size: 0.9em; }

  /* Section micro-labels (#47): 11 px / weight 600 per visual identity §4. */
  .section-micro-label {
    flex: 1 1 auto;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--tk-fg-muted);
  }

  /* Task Footer (#47): vertical list of 1-line mini-cards using the .card
     primitive plus the .card--mini modifier. Renders OUTSIDE the detail
     card on the plain sidebar background. */
  .detail-footer { margin-top: 6px; }
  .detail-footer-list { list-style: none; margin: 0; padding: 0; max-height: calc(5 * 28px); overflow-y: auto; }
  .card--mini {
    flex-direction: row;
    align-items: center;
    height: 24px;
    padding: 0 8px;
    margin: 2px 8px;
    gap: 6px;
  }
  .card--mini .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card--mini .id { color: var(--tk-fg-muted); font-size: 0.85em; }
`;

function renderList(state: SidebarState): string {
  if (state.tasks.length === 0) {
    return `<div class="tackle-empty">No tasks.</div>`;
  }
  const { open, closed } = partitionTasks(state.tasks);
  const header = `<div class="list-header">${open.length} open · ${closed.length} closed</div>`;
  const byTask = sessionsByTask(state.sessions);
  const sorted = sortTasks(open, byTask);
  const items = sorted
    .map((t) =>
      renderCard(
        t,
        byTask.get(t.id) ?? [],
        t.id === state.activeTaskId,
        state.expandedCardIds.has(t.id),
      ),
    )
    .join('');
  const list = `<ul class="card-list">${items}</ul>`;
  const folder = renderClosedFolder(closed, state.closedFolderOpen);
  return `${header}${list}${folder}`;
}

function closedDate(t: { synced_at: string; created_at: string }): string {
  return t.synced_at || t.created_at || '';
}

function renderClosedRow(t: import('@tackle/shared').Task): string {
  const title = escapeHtml(t.title);
  const extId = escapeHtml(t.external_id);
  const date = escapeHtml(closedDate(t));
  return `<div class="closed-row card--closed" data-action="enterDetail" data-task-id="${t.id}">
  <span class="title">${title}</span>
  <span class="id">#${extId}</span>
  <span class="date">${date}</span>
</div>`;
}

function renderClosedFolder(closed: import('@tackle/shared').Task[], open: boolean): string {
  if (closed.length === 0) return '';
  const caret = open ? '▾' : '▸';
  const folder = `<div class="closed-folder" data-action="toggleClosedFolder">${caret} Closed (${closed.length})</div>`;
  if (!open) return folder;
  const sorted = closed
    .slice()
    .sort((a, b) => {
      const ka = closedDate(a);
      const kb = closedDate(b);
      if (ka !== kb) return ka < kb ? 1 : -1;
      return a.id - b.id;
    });
  const rows = sorted.map(renderClosedRow).join('');
  return `${folder}<div class="closed-rows">${rows}</div>`;
}

export function render(state: SidebarState): string {
  const body =
    state.mode === 'list' ? renderList(state) : renderDetail(state);
  // The `<style>` block lives INSIDE the body so it survives the
  // innerHTML extraction in handle-outbound.ts (which pulls only the
  // body contents into #root). If we put it in <head> the tokens and
  // component CSS would silently vanish on every render and the sidebar
  // would paint as unstyled plain text.
  return `<!doctype html>
<html><head><meta charset="utf-8"></head><body><style>${THEME_CSS}${COMPONENT_CSS}</style>${body}</body></html>`;
}
