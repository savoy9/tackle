// Detail Mode renderer (#47).
//
// Renders the entire Detail surface as a single outer Active card — the
// visual continuation of "the user clicked a Task card and it expanded".
// All section separators inside the card are whitespace only — there are
// no internal border or border-top rules.
//
// Composition:
//   - Top-level container <div class="tackle-detail card card--active"> uses
//     the Active card visual treatment from #46 (lift + shadow + accent
//     stroke + --tk-card-bg-active fill).
//   - Description area uses --tk-description-bg with 8x10 padding, 4px
//     radius, 40vh max-height, internal scroll.
//   - Session rows use the renderSessionRow primitive with surface='detail'
//     so action buttons are hover-revealed.
//   - Task Footer below the card renders other tasks as 1-line mini-cards
//     using the .card primitive (card + card--mini), with a soft Edge Bar
//     when the task has a running session.
//
// Section micro-labels ("Sessions") use the .section-micro-label class
// (11px / 600 per visual identity §4).

import type { SidebarState } from './sidebar-state';
import type { Task } from '@tackle/shared';
import { sortTasks } from './sort';
import { isClosedStatus } from './closed';
import { escapeHtml, EXT_ICON } from './html';
import { edgeBarClassFor, EDGE_BAR_CLASS } from './edge-bar';
import { renderSessionRow, SESSION_ROW_DETAIL_CLASS } from './render-session-row';
import { renderPhaseTracker } from './render-phase-tracker';

export { SESSION_ROW_DETAIL_CLASS };

function sessionsFor(state: SidebarState, taskId: number) {
  return state.sessions.filter((s) => s.task_id === taskId && !s.deleted_at);
}

function renderFooterMiniCard(t: Task, runningInTask: boolean): string {
  const title = escapeHtml(t.title);
  const extId = escapeHtml(t.external_id);
  // Soft edge bar only when the task has at least one running session AND
  // it's not the focused task (the focused task IS this detail surface).
  const edgeState = runningInTask ? 'soft' : 'off';
  const edgeBar =
    edgeState === 'off'
      ? ''
      : `<span class="${EDGE_BAR_CLASS} ${edgeBarClassFor(edgeState)}" aria-hidden="true"></span>`;
  return `<li class="card card--mini" data-action="switchDetailTo" data-task-id="${t.id}" title="${title}">
  ${edgeBar}
  <span class="title">${title}</span>
  <span class="id">#${extId}</span>
</li>`;
}

export function renderDetail(state: SidebarState): string {
  // Detail mode is only valid when state.mode is the detail tagged variant;
  // callers (top-level render) should guard. We accept SidebarState here for
  // ergonomics and pluck the taskId.
  if (state.mode === 'list') {
    return '';
  }
  const taskId = state.mode.taskId;
  const task = state.tasks.find((t) => t.id === taskId);

  if (!task) {
    return `<div class="tackle-detail card card--active">
  <div class="detail-header">
    <button class="detail-back" data-action="exitDetail" title="Back">◀ Back</button>
    <span class="detail-title">#${taskId}</span>
  </div>
</div>`;
  }

  const title = escapeHtml(task.title);
  const extIcon = EXT_ICON[task.external_system];
  const extId = escapeHtml(task.external_id);
  const status = escapeHtml(task.external_status);
  const assignee = task.assignee ? escapeHtml(task.assignee) : '';

  const header = `<div class="detail-header">
    <button class="detail-back" data-action="exitDetail" title="Back">◀ Back</button>
    <span class="detail-title">${title}</span>
    <span class="tackle-status-badge" data-tackle-status="${escapeHtml(task.tackle_status ?? 'not_started')}" title="Tackle Status">${escapeHtml(task.tackle_status ?? 'not_started')}</span>
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

  const taskSessions = sessionsFor(state, task.id);
  const branchLine = task.worktree_branch
    ? `<div class="detail-branch">🌿 ${escapeHtml(task.worktree_branch)}</div>`
    : `<div class="detail-branch detail-branch-empty">🌿 no worktree yet</div>`;

  const runningCount = taskSessions.filter((s) => s.status === 'running').length;
  const closedIndicator =
    isClosedStatus(task.external_status) && runningCount >= 1
      ? `<div class="detail-closed-indicator">Externally closed — ${runningCount} session${runningCount === 1 ? '' : 's'} still running</div>`
      : '';

  const descHtml = state.descriptionsByTaskId?.[task.id] ?? '';
  const phaseTracker = renderPhaseTracker({
    task,
    phases: state.phases ?? [],
    plans: state.plans ?? [],
    sessions: state.sessions ?? [],
  });
  const description = `${phaseTracker}<div class="detail-description">${descHtml}</div>`;

  const sessionsBody =
    taskSessions.length > 0
      ? taskSessions.map((s) => renderSessionRow(s, { surface: 'detail' })).join('')
      : `<div class="detail-sessions-empty">No sessions.</div>`;
  const sessionsSection = `<div class="detail-sessions">
    <div class="detail-sessions-header">
      <span class="detail-sessions-label section-micro-label">Sessions</span>
      <button class="detail-sessions-add" title="New Session" data-action="newSession" data-task-id="${task.id}">+</button>
    </div>
    <div class="detail-sessions-body">${sessionsBody}</div>
  </div>`;

  // Outer card wraps every section above. Footer is rendered OUTSIDE the
  // card (on the plain sidebar background) so context-switching reads as
  // "the rest of the list".
  const detailCard = `<div class="tackle-detail card card--active">
  ${header}
  ${breadcrumb}
  ${identity}
  ${branchLine}
  ${closedIndicator}
  ${description}
  ${sessionsSection}
</div>`;

  const otherTasks = state.tasks.filter((t) => t.id !== task.id);
  let footer = '';
  if (otherTasks.length > 0) {
    // Sort using the same sortTasks pipeline as List Mode for visual continuity.
    const byTask = new Map<number, ReturnType<typeof sessionsFor>>();
    for (const t of otherTasks) byTask.set(t.id, sessionsFor(state, t.id));
    const sorted = sortTasks(otherTasks, byTask);
    const rows = sorted
      .map((t) => {
        const sessions = byTask.get(t.id) ?? [];
        const hasRunning = sessions.some((s) => s.status === 'running');
        // Mini-card primitive shows title + #id only (glyph parity with the
        // full card is intentionally deferred to keep the row to one line
        // at 24px height — see #47 acceptance criteria).
        return renderFooterMiniCard(t, hasRunning);
      })
      .join('');
    footer = `<div class="detail-footer"><ul class="detail-footer-list">${rows}</ul></div>`;
  }

  return `${detailCard}${footer}`;
}
