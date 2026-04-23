// Task Card primitive — state matrix (#46) layered on the idle primitive
// landed in #45.
//
// Visual identity contract: rounded 5 px, 1 px stroke, --tk-card-bg fill,
// 4 px padding, 3 px gap. All colors come from --tk-* tokens. No
// var(--vscode-*) for color (font props excepted by convention).
//
// State modifiers (mutually exclusive on Active vs Running):
//   card--active   — the user's Active Task. Stacks lift + shadow + accent
//                    stroke + fill bump + full-opacity Edge Bar.
//   card--running  — non-Active Task with a running Session. Soft Edge Bar.
//   card--closed   — Closed Folder rows (sunken treatment, no Edge Bar).
//   card--hover    — applied via CSS :hover (kept as a class for parity with
//                    the spec's mental model and for snapshot stability when
//                    a future test wants to assert a hover-explicit variant).

import type { Task, Session } from '@tackle/shared';
import { rollupGlyph, sessionGlyph } from './glyph';
import { KIND_ICON } from '../session/kind-icon';
import {
  deriveEdgeBarState,
  edgeBarClassFor,
  EDGE_BAR_CLASS,
} from './edge-bar';

export { KIND_ICON };

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const EXT_ICON: Record<Task['external_system'], string> = {
  github: 'GH',
  ado: 'ADO',
};

export function sessionsByTask(sessions: Session[]): Map<number, Session[]> {
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

export function renderSessionRows(sessions: Session[]): string {
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

export function renderCard(
  task: Task,
  sessions: Session[],
  active: boolean,
  expanded: boolean,
): string {
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

  const cardClasses = ['card'];
  const edgeState = deriveEdgeBarState(task, sessions, active);
  if (active) cardClasses.push('card--active');
  else if (edgeState !== 'off') cardClasses.push('card--running');
  const cardClass = cardClasses.join(' ');
  const edgeBar =
    edgeState === 'off'
      ? ''
      : `<span class="${EDGE_BAR_CLASS} ${edgeBarClassFor(edgeState)}" aria-hidden="true"></span>`;
  return `<li class="${cardClass}" data-action="toggleExpanded" data-task-id="${task.id}">
  ${edgeBar}
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
