import type { Task, Session, SessionKind } from '@tackle/shared';
import type { SidebarState } from './sidebar-state';
import { rollupGlyph, sessionGlyph } from './glyph';
import { sortTasks } from './sort';
import { partitionTasks, isClosedStatus } from './closed';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const KIND_ICON: Record<SessionKind, string> = {
  plan: '📓',
  implement: '⌨️',
  review: '👁',
  debug: '🐞',
  test: '🧪',
  pilot: '🚀',
  shell: '💻',
};

const EXT_ICON: Record<Task['external_system'], string> = {
  github: 'GH',
  ado: 'ADO',
};

const STYLE = `
  body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); margin: 0; padding: 0; }
  .tackle-empty { padding: 12px; color: var(--vscode-descriptionForeground); }
  .card-list { list-style: none; margin: 0; padding: 0; }
  .card { position: relative; padding: 6px 10px 6px 12px; cursor: pointer; border-left: 3px solid transparent; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .card.active { border-left: 3px solid var(--vscode-focusBorder); background: var(--vscode-list-inactiveSelectionBackground); }
  .card .line { display: flex; align-items: center; gap: 6px; min-height: 18px; }
  .card .line1 .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .card .line1 .activate, .card .line1 .overflow { background: transparent; color: var(--vscode-foreground); border: none; cursor: pointer; padding: 0 4px; }
  .card .line1 .activate:hover, .card .line1 .overflow:hover { background: var(--vscode-toolbar-hoverBackground); }
  .card .ext-icon { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .card .id { color: var(--vscode-descriptionForeground); }
  .card .parent { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .card .rollup { color: var(--vscode-descriptionForeground); }
  .card .branch { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .card .new-session { color: var(--vscode-textLink-foreground); cursor: pointer; }
  .session-rows { padding: 0 10px 6px 24px; }
  .session-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; }
  .session-row:hover { background: var(--vscode-list-hoverBackground); }
  .session-row .label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-row .icon-btn { background: transparent; color: var(--vscode-foreground); border: none; cursor: pointer; padding: 0 3px; }
  .session-row .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .session-divider { height: 1px; background: var(--vscode-panel-border); margin: 4px 0; opacity: 0.6; }
  .list-header { padding: 6px 12px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .closed-folder { padding: 6px 12px; cursor: pointer; color: var(--vscode-descriptionForeground); user-select: none; }
  .closed-folder:hover { background: var(--vscode-list-hoverBackground); }
  .closed-rows { padding: 0 12px 6px 24px; }
  .closed-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .closed-row:hover { background: var(--vscode-list-hoverBackground); }
  .closed-row .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; }
  .closed-row .id { color: var(--vscode-descriptionForeground); }
  .closed-row .date { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .tackle-detail { padding: 8px 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
  .tackle-detail-header { font-weight: bold; margin-bottom: 8px; }
  .tackle-back { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; }
  .tackle-back:hover { background: var(--vscode-button-hoverBackground); }
  .detail-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .detail-back { background: transparent; color: var(--vscode-foreground); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-back:hover { background: var(--vscode-toolbar-hoverBackground); }
  .detail-title { flex: 1 1 auto; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-overflow { background: transparent; color: var(--vscode-foreground); border: none; cursor: pointer; padding: 2px 6px; }
  .detail-overflow:hover { background: var(--vscode-toolbar-hoverBackground); }
  .detail-breadcrumb { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 2px; }
  .detail-identity { display: flex; gap: 6px; align-items: center; color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 2px; }
  .detail-branch { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 2px; }
  .detail-closed-indicator { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.85em; margin: 4px 0; }
  .detail-description { max-height: 40vh; overflow-y: auto; padding: 6px 4px; margin: 6px 0; border: 1px solid var(--vscode-panel-border); }
  .detail-description img { max-width: 100%; height: auto; }
  .detail-description pre { overflow-x: auto; }
  .detail-sessions { margin-top: 6px; flex-shrink: 0; }
  .detail-sessions-header { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-top: 1px solid var(--vscode-panel-border); }
  .detail-sessions-label { flex: 1 1 auto; font-weight: bold; font-size: 0.9em; }
  .detail-sessions-add { background: transparent; color: var(--vscode-textLink-foreground); border: none; cursor: pointer; padding: 0 4px; font-size: 1.1em; }
  .detail-sessions-add:hover { background: var(--vscode-toolbar-hoverBackground); }
  .detail-sessions-empty { color: var(--vscode-descriptionForeground); padding: 4px; font-size: 0.9em; }
  .detail-footer { margin-top: 8px; }
  .detail-footer-rule { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 0 0 4px 0; }
  .detail-footer-list { list-style: none; margin: 0; padding: 0; max-height: calc(5 * 22px); overflow-y: auto; }
  .detail-footer-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; cursor: pointer; }
  .detail-footer-row:hover { background: var(--vscode-list-hoverBackground); }
  .detail-footer-row .title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-footer-row .id { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
`;

function sessionsByTask(sessions: Session[]): Map<number, Session[]> {
  const m = new Map<number, Session[]>();
  for (const s of sessions) {
    if (s.task_id == null) continue;
    if (s.deleted_at) continue;
    const list = m.get(s.task_id);
    if (list) list.push(s);
    else m.set(s.task_id, [s]);
  }
  return m;
}

export function renderSessionRow(sess: Session): string {
  const glyph = sessionGlyph(sess);
  const kind = KIND_ICON[sess.kind];
  const label = escapeHtml(sess.tab_label || sess.name);
  return `<div class="session-row" data-action="focusSession" data-session-id="${sess.id}">
  <span class="kind">${kind}</span>
  <span class="label">${label}</span>
  <span class="glyph">${glyph}</span>
  <button class="icon-btn stop" title="Stop" data-action="stopSession" data-session-id="${sess.id}">⏹</button>
  <button class="icon-btn done" title="Mark Done" data-action="markSessionDone" data-session-id="${sess.id}">✓</button>
  <button class="icon-btn overflow" title="More" data-action="sessionOverflow" data-session-id="${sess.id}">⋯</button>
</div>`;
}

function renderSessionRows(sessions: Session[]): string {
  const active = sessions.filter((s) => s.status === 'running');
  const inactive = sessions.filter((s) => s.status !== 'running');
  const parts: string[] = [];
  parts.push(`<div class="session-rows">`);
  for (const s of active) parts.push(renderSessionRow(s));
  if (inactive.length > 0) {
    parts.push(`<div class="session-divider"></div>`);
  }
  for (const s of inactive) parts.push(renderSessionRow(s));
  parts.push(`</div>`);
  return parts.join('');
}

function renderCard(task: Task, sessions: Session[], active: boolean, expanded: boolean): string {
  const glyph = rollupGlyph(sessions);
  const title = escapeHtml(task.title);
  const extIcon = EXT_ICON[task.external_system];
  const extId = escapeHtml(task.external_id);
  const parentHtml = task.parent_external_id
    ? `<span class="parent">↳ #${escapeHtml(task.parent_external_id)}</span>`
    : '';
  const activateBtn = active
    ? ''
    : `<button class="activate" title="Activate" data-action="activateTask" data-task-id="${task.id}">▶</button>`;

  // Line 3: rollup counts or + New session affordance.
  let line3: string;
  if (sessions.length === 0) {
    line3 = `<div class="line line3"><span class="new-session" data-action="newSession" data-task-id="${task.id}">+ New session</span></div>`;
  } else {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      const g = sessionGlyph(s);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    const order: string[] = ['✳️', '⏳', '●', '○', '✔️', '🚫'];
    const bits = order
      .filter((g) => counts[g])
      .map((g) => `<span>${g}${counts[g]}</span>`)
      .join(' ');
    line3 = `<div class="line line3"><span class="rollup">${bits}</span></div>`;
  }

  const cardClass = active ? 'card active' : 'card';
  return `<li class="${cardClass}" data-action="toggleExpanded" data-task-id="${task.id}">
  <div class="line line1">
    <span class="glyph">${glyph}</span>
    <span class="title" data-action="enterDetail" data-task-id="${task.id}">${title}</span>
    ${activateBtn}
    <button class="overflow" title="More" data-action="taskOverflow" data-task-id="${task.id}">⋯</button>
  </div>
  <div class="line line2">
    <span class="ext-icon">${extIcon}</span>
    <span class="id">#${extId}</span>
    ${parentHtml}
  </div>
  ${line3}
</li>${expanded ? renderSessionRows(sessions) : ''}`;
}

function closedDate(t: Task): string {
  // Task has no dedicated `closed_at`; use synced_at (most recently observed state)
  // as a proxy. If unavailable, fall back to created_at. Empty string if neither.
  return t.synced_at || t.created_at || '';
}

function renderClosedRow(t: Task): string {
  const title = escapeHtml(t.title);
  const extId = escapeHtml(t.external_id);
  const date = escapeHtml(closedDate(t));
  return `<div class="closed-row" data-action="enterDetail" data-task-id="${t.id}">
  <span class="title">${title}</span>
  <span class="id">#${extId}</span>
  <span class="date">${date}</span>
</div>`;
}

function renderClosedFolder(closed: Task[], open: boolean): string {
  if (closed.length === 0) return '';
  const caret = open ? '▾' : '▸';
  const folder = `<div class="closed-folder" data-action="toggleClosedFolder">${caret} Closed (${closed.length})</div>`;
  if (!open) return folder;
  // Sort closed tasks by updated_at (synced_at) desc.
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

function mostRecentWorktreePath(sessions: Session[]): string | null {
  // Pick worktree_path from the most-recently-active session (started_at desc), null-safe.
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
  // Last path segment as a branch-ish label.
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

  // Header
  const header = `<div class="detail-header">
    <button class="detail-back" data-action="exitDetail" title="Back">◀ Back</button>
    <span class="detail-title">${title}</span>
    <button class="detail-overflow" title="More" data-action="taskOverflow" data-task-id="${task.id}">⋯</button>
  </div>`;

  // Breadcrumb
  const breadcrumb = task.parent_external_id
    ? `<div class="detail-breadcrumb">↳ #${escapeHtml(task.parent_external_id)}</div>`
    : '';

  // Identity line
  const identity = `<div class="detail-identity">
    <span class="ext-icon">${extIcon}</span>
    <span class="id">#${extId}</span>
    <span class="status">${status}</span>
    ${assignee ? `<span class="assignee">${assignee}</span>` : ''}
  </div>`;

  // Branch line
  const taskSessions = state.sessions.filter((s) => s.task_id === task.id && !s.deleted_at);
  const wtPath = mostRecentWorktreePath(taskSessions);
  const branchLine = wtPath
    ? `<div class="detail-branch">🌿 ${escapeHtml(branchFromPath(wtPath))}</div>`
    : '';

  // Externally-closed indicator
  const runningCount = taskSessions.filter((s) => s.status === 'running').length;
  const closedIndicator =
    isClosedStatus(task.status) && runningCount >= 1
      ? `<div class="detail-closed-indicator">Externally closed — ${runningCount} session${runningCount === 1 ? '' : 's'} still running</div>`
      : '';

  // Description (precomputed HTML; controller populates descriptionsByTaskId)
  const descHtml = state.descriptionsByTaskId?.[task.id] ?? '';
  const description = `<div class="detail-description">${descHtml}</div>`;

  // Sessions section
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

  // Task Footer: other tasks, activity-sorted, up to ~5 visible (scrollable)
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
<html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`;
}
