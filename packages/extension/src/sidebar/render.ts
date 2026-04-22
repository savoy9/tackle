import type { SidebarState } from './sidebar-state';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLE = `
  body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); margin: 0; padding: 0; }
  .tackle-list { list-style: none; margin: 0; padding: 0; }
  .tackle-list li { padding: 4px 12px; cursor: pointer; }
  .tackle-list li:hover { background: var(--vscode-list-hoverBackground); }
  .tackle-list li.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .tackle-empty { padding: 12px; color: var(--vscode-descriptionForeground); }
  .tackle-detail { padding: 8px 12px; }
  .tackle-detail-header { font-weight: bold; margin-bottom: 8px; }
  .tackle-back { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; cursor: pointer; }
  .tackle-back:hover { background: var(--vscode-button-hoverBackground); }
`;

function renderList(state: SidebarState): string {
  if (state.tasks.length === 0) {
    return `<div class="tackle-empty">No tasks.</div>`;
  }
  const items = state.tasks
    .map((t) => {
      const active = t.id === state.activeTaskId ? ' active' : '';
      return `<li class="tackle-task${active}" data-task-id="${t.id}">${escapeHtml(t.title)}</li>`;
    })
    .join('');
  return `<ul class="tackle-list">${items}</ul>`;
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
    state.mode === 'list'
      ? renderList(state)
      : renderDetail(state, state.mode.taskId);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`;
}
