// Phase Tracker render module (#76).
//
// Renders the Phase Tracker into the slot reserved at the top of the Detail
// Mode Description region. The tracker shows:
//   - A header row with the Plan Source link (when known) and a progress bar
//     reflecting `complete` Phase count out of total. The Tackle Status
//     badge already lives in the Detail Header above (slice 1, #74).
//   - Either an empty-state region (when no Phases exist) or a rows region
//     (one row per Phase, ordered by sort_order). Empty-state buttons and
//     Phase row internals are filled in by sibling slices.
//
// Pure function; no DOM, no IO. Caller passes in the Task plus the locally
// mirrored Phases and Plans.

import type { Task, Phase, Plan } from '@tackle/shared';
import { escapeHtml } from './html';

export interface RenderPhaseTrackerInput {
  task: Task;
  phases: Phase[];
  plans: Plan[];
}

/**
 * Pure render. Returns the inner HTML for the phase-tracker slot.
 */
export function renderPhaseTracker(input: RenderPhaseTrackerInput): string {
  const { task, phases, plans } = input;
  const phasesForTask = phases
    .filter((p) => p.task_id === task.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  const total = phasesForTask.length;
  const complete = phasesForTask.filter((p) => p.status === 'done').length;

  const planForTask = plans.find((p) => p.task_id === task.id);
  const sourceLink = planForTask?.source_ref
    ? `<a class="phase-tracker-source" href="#" data-action="openPlanSource" data-task-id="${task.id}">${escapeHtml(
        planForTask.source_ref,
      )}</a>`
    : '';

  const progress = `<div class="phase-tracker-progress" data-complete="${complete}" data-total="${total}" role="progressbar" aria-valuenow="${complete}" aria-valuemin="0" aria-valuemax="${total}"></div>`;

  const status = task.tackle_status ?? 'not_started';
  const approveBtn =
    status === 'plan_awaiting_approval'
      ? `<button class="phase-tracker-approve" data-action="approvePlan" data-task-id="${task.id}">Approve Plan</button>`
      : '';
  const implementBtn =
    status === 'plan_approved'
      ? `<button class="phase-tracker-implement" data-action="startImplementation" data-task-id="${task.id}">Implement</button>`
      : '';

  const header = `<div class="phase-tracker-header">${sourceLink}${progress}<span class="phase-tracker-actions" data-task-id="${task.id}">${approveBtn}${implementBtn}</span></div>`;

  let body = '';
  if (phasesForTask.length === 0) {
    let buttons = '';
    if (status === 'not_started') {
      buttons =
        `<button class="phase-tracker-empty-btn" data-action="createPlan" data-task-id="${task.id}">+ Create Plan</button>` +
        `<button class="phase-tracker-empty-btn" data-action="linkExistingPlan" data-task-id="${task.id}">Link existing plan…</button>`;
    } else if (status === 'plan_started') {
      buttons =
        `<button class="phase-tracker-empty-btn" data-action="openPlanSession" data-task-id="${task.id}">Open Plan Session →</button>` +
        `<button class="phase-tracker-empty-btn" data-action="linkExistingPlan" data-task-id="${task.id}">Link existing plan…</button>`;
    }
    body = `<div class="phase-tracker-empty" data-task-id="${task.id}" data-tackle-status="${escapeHtml(
      status,
    )}">${buttons}</div>`;
  } else {
    const rows = phasesForTask
      .map((p) => {
        const extId = p.external_id ? escapeHtml(p.external_id) : '';
        const idLink = p.external_id ? `<span class="phase-tracker-row-id">#${extId}</span>` : '';
        return (
          `<div class="phase-tracker-row" data-action="scrollToPhaseSession" data-phase-id="${p.id}" data-status="${escapeHtml(
            p.status,
          )}">` +
          `<span class="phase-tracker-row-glyph" aria-hidden="true"></span>` +
          `<span class="phase-tracker-row-title">${escapeHtml(p.name)}</span>` +
          idLink +
          `</div>`
        );
      })
      .join('');
    body = `<div class="phase-tracker-rows">${rows}</div>`;
  }

  return `<div class="phase-tracker" data-task-id="${task.id}">${header}${body}</div>`;
}
