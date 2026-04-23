// Top-level render module. Composes the sub-render modules and prepends the
// design-token stylesheet (THEME_CSS) and the sidebar's component CSS.
//
// Component CSS rule (#45): use var(--tk-*) for color/elevation/radius.
// `var(--vscode-*)` is permitted for font family/size and as a fallback
// inside the HC token blocks (--vscode-contrastBorder). No inline hex.

import type { Session } from '@tackle/shared';
import type { SidebarState } from './sidebar-state';
import { rollupGlyph } from './glyph';
import { sortTasks } from './sort';
import { partitionTasks, isClosedStatus } from './closed';
import { THEME_CSS } from './theme';
import {
  escapeHtml,
  EXT_ICON,
  renderCard,
  renderSessionRow,
  sessionsByTask,
} from './render-card';

// Re-export for any external import sites that still reference the old module.
export { renderSessionRow } from './render-card';

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

  .session-rows { padding: 0 10px 6px 24px; }
  .session-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; }
  .session-row .label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .icon-btn { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 0 3px; }
  .session-divider { height: 1px; background: var(--tk-stroke-muted); margin: 4px 0; opacity: 0.6; }

  .list-header { padding: 6px 12px; color: var(--tk-fg-muted); font-size: 0.9em; }
  .closed-folder { padding: 6px 12px; cursor: pointer; color: var(--tk-fg-muted); user-select: none; }
  .closed-rows { padding: 0 12px 6px 24px; }
  .closed-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--tk-fg); }
  .closed-row .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; }
  .closed-row .id { color: var(--tk-fg-muted); }
  .closed-row .date { color: var(--tk-fg-muted); font-size: 0.85em; }

  .tackle-detail { padding: 8px 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
  .tackle-detail-header { font-weight: bold; margin-bottom: 8px; }
  .detail-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .detail-back { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-title { flex: 1 1 auto; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-overflow { background: transparent; color: var(--tk-fg); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-breadcrumb { color: var(--tk-fg-muted); font-size: 0.85em; margin-bottom: 2px; }
  .detail-identity { display: flex; gap: 6px; align-items: center; color: var(--tk-fg-muted); font-size: 0.9em; margin-bottom: 2px; }
  .detail-branch { color: var(--tk-fg-muted); font-size: 0.85em; margin-bottom: 2px; }
  .detail-closed-indicator { color: var(--tk-fg-muted); font-style: italic; font-size: 0.85em; margin: 4px 0; }
  .detail-description { max-height: 40vh; overflow-y: auto; padding: 6px 4px; margin: 6px 0; background: var(--tk-description-bg); border: var(--tk-stroke-width) solid var(--tk-stroke-muted); }
  .detail-description img { max-width: 100%; height: auto; }
  .detail-description pre { overflow-x: auto; }
  .detail-sessions { margin-top: 6px; flex-shrink: 0; }
  .detail-sessions-header { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-top: var(--tk-stroke-width) solid var(--tk-stroke-muted); }
  .detail-sessions-label { flex: 1 1 auto; font-weight: bold; font-size: 0.9em; }
  .detail-sessions-add { background: transparent; color: var(--tk-accent); border: none; cursor: pointer; padding: 0 4px; font-size: 1.1em; }
  .detail-sessions-empty { color: var(--tk-fg-muted); padding: 4px; font-size: 0.9em; }
  .detail-footer { margin-top: 8px; }
  .detail-footer-rule { border: none; border-top: var(--tk-stroke-width) solid var(--tk-stroke-muted); margin: 0 0 4px 0; }
  .detail-footer-list { list-style: none; margin: 0; padding: 0; max-height: calc(5 * 22px); overflow-y: auto; }
  .detail-footer-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; color: var(--tk-fg); }
  .detail-footer-row .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-footer-row .id { color: var(--tk-fg-muted); font-size: 0.85em; }
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

function mostRecentWorktreePath(sessions: Session[]): string | null {
  const withPath = sessions.filter((s) => s.worktree_path);
  if (withPath.length === 0) return null;
  const sorted = withPath.slice().sort((a, b) => {
    const ka = a.started_at || '';
    const kb = b.started_at || '';
    if (ka !== kb) return ka < kb ? 1 : -1;
    return b.id - a.id;
  });
  return sorted[0].worktree_path;
}

function branchFromPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function renderDetail(state: SidebarState, taskId: number): string {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    return `<div class="tackle-detail">
  <div class="detail-header">
    <button class="detail-back" data-action="exitDetail" title="Back">◀ Back</button>
    <span class="detail-title">#${taskId}</span>
  </div>
</div>`;
  }

  const title = escapeHtml(task.title);
  const extIcon = EXT_ICON[task.external_system];
  const extId = escapeHtml(task.external_id);
  const status = escapeHtml(task.status);
  const assignee = task.assignee ? escapeHtml(task.assignee) : '';

  const header = `<div class="detail-header">
    <button class="detail-back" data-action="exitDetail" title="Back">◀ Back</button>
    <span class="detail-title">${title}</span>
    <button class="detail-overflow" title="More" data-action="taskOverflow" data-task-id="${task.id}">⋯</button>
  </div>`;

  const breadcrumb = task.parent_external_id
    ? `<div class="detail-breadcrumb">↳ #${escapeHtml(task.parent_external_id)}</div>`
    : '';

  const identity = `<div class="detail-identity">
    <span class="ext-icon">${extIcon}</span>
    <span class="id">#${extId}</span>
    <span class="status">${status}</span>
    ${assignee ? `<span class="assignee">${assignee}</span>` : ''}
  </div>`;

  const taskSessions = state.sessions.filter((s) => s.task_id === task.id && !s.deleted_at);
  const wtPath = mostRecentWorktreePath(taskSessions);
  const branchLine = wtPath
    ? `<div class="detail-branch">🌿 ${escapeHtml(branchFromPath(wtPath))}</div>`
    : '';

  const runningCount = taskSessions.filter((s) => s.status === 'running').length;
  const closedIndicator =
    isClosedStatus(task.status) && runningCount >= 1
      ? `<div class="detail-closed-indicator">Externally closed — ${runningCount} session${runningCount === 1 ? '' : 's'} still running</div>`
      : '';

  const descHtml = state.descriptionsByTaskId?.[task.id] ?? '';
  const description = `<div class="detail-description">${descHtml}</div>`;

  const sessionsBody = taskSessions.length > 0
    ? taskSessions.map((s) => renderSessionRow(s)).join('')
    : `<div class="detail-sessions-empty">No sessions.</div>`;
  const sessionsSection = `<div class="detail-sessions">
    <div class="detail-sessions-header">
      <span class="detail-sessions-label">Sessions</span>
      <button class="detail-sessions-add" title="New Session" data-action="newSession" data-task-id="${task.id}">+</button>
    </div>
    <div class="detail-sessions-body">${sessionsBody}</div>
  </div>`;

  const otherTasks = state.tasks.filter((t) => t.id !== task.id);
  let footer = '';
  if (otherTasks.length > 0) {
    const byTask = sessionsByTask(state.sessions);
    const sorted = sortTasks(otherTasks, byTask);
    const rows = sorted
      .map((t) => {
        const g = rollupGlyph(byTask.get(t.id) ?? []);
        const tTitle = escapeHtml(t.title);
        const tId = escapeHtml(t.external_id);
        return `<li class="detail-footer-row" data-action="switchDetailTo" data-task-id="${t.id}" title="${tTitle}">
      <span class="glyph">${g}</span>
      <span class="title">${tTitle}</span>
      <span class="id">#${tId}</span>
    </li>`;
      })
      .join('');
    footer = `<div class="detail-footer"><hr class="detail-footer-rule" /><ul class="detail-footer-list">${rows}</ul></div>`;
  }

  return `<div class="tackle-detail">
  ${header}
  ${breadcrumb}
  ${identity}
  ${branchLine}
  ${closedIndicator}
  ${description}
  ${sessionsSection}
  ${footer}
</div>`;
}

export function render(state: SidebarState): string {
  const body =
    state.mode === 'list' ? renderList(state) : renderDetail(state, state.mode.taskId);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${THEME_CSS}${COMPONENT_CSS}</style></head><body>${body}</body></html>`;
}
