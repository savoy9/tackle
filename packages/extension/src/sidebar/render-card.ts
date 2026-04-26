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
import { escapeHtml, EXT_ICON } from './html';
import { deriveEdgeBarState, edgeBarClassFor, EDGE_BAR_CLASS } from './edge-bar';
import {
  renderSessionRow as renderSessionRowImpl,
  renderSessionRows as renderSessionRowsImpl,
  type RenderSessionRowOptions,
} from './render-session-row';

export { KIND_ICON, escapeHtml, EXT_ICON };

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

// Re-exports keep the old module surface working for callers that still
// import from render-card. The split into render-session-row.ts (#47) lets
// Detail Mode opt into hover-revealed action buttons via the surface flag.
export function renderSessionRow(sess: Session, opts: RenderSessionRowOptions = {}): string {
  return renderSessionRowImpl(sess, opts);
}

export function renderSessionRows(sessions: Session[], opts: RenderSessionRowOptions = {}): string {
  return renderSessionRowsImpl(sessions, opts);
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
