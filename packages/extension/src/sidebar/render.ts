import type { Task, Session, SessionKind } from '@tackle/shared';
import type { SidebarState } from './sidebar-state';
import { rollupGlyph, sessionGlyph } from './glyph';
import { sortTasks } from './sort';

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
  .tackle-detail { padding: 8px 12px; }
  .tackle-detail-header { font-weight: bold; margin-bottom: 8px; }
  .tackle-back { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; }
  .tackle-back:hover { background: var(--vscode-button-hoverBackground); }
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

function renderSessionRow(sess: Session): string {
  const glyph = sessionGlyph(sess);
  const kind = KIND_ICON[sess.kind] ?? '●';
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
  if (active.length > 0 && inactive.length > 0) {
    parts.push(`<div class="session-divider"></div>`);
  } else if (inactive.length > 0) {
    // still render a divider so layout is predictable when only inactive exist
    parts.push(`<div class="session-divider"></div>`);
  }
  for (const s of inactive) parts.push(renderSessionRow(s));
  parts.push(`</div>`);
  return parts.join('');
}

function renderCard(task: Task, sessions: Session[], active: boolean, expanded: boolean): string {
  const glyph = rollupGlyph(sessions);
  const title = escapeHtml(task.title);
  const extIcon = EXT_ICON[task.external_system] ?? '?';
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

function renderList(state: SidebarState): string {
  if (state.tasks.length === 0) {
    return `<div class="tackle-empty">No tasks.</div>`;
  }
  const byTask = sessionsByTask(state.sessions);
  const sorted = sortTasks(state.tasks, byTask);
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
  return `<ul class="card-list">${items}</ul>`;
}

function renderDetail(state: SidebarState, taskId: number): string {
  const task = state.tasks.find((t) => t.id === taskId);
  const title = task ? escapeHtml(task.title) : `#${taskId}`;
  return `<div class="tackle-detail">
  <div class="tackle-detail-header">Detail: ${title}</div>
  <button class="tackle-back" data-action="exitDetail">Back</button>
</div>`;
}

export function render(state: SidebarState): string {
  const body =
    state.mode === 'list' ? renderList(state) : renderDetail(state, state.mode.taskId);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`;
}
