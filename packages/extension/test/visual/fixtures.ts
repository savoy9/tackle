// Fixtures for the visual snapshot suite.
//
// Each fixture seeds a SidebarState that maps to one of the 13 named visual
// states from the PR #50 HITL checklist (issue #67). Tests render the fixture
// via `render(state)` and snapshot the normalized HTML.
//
// The "session-kind-quickpick" state is the one outlier: the QuickPick lives
// outside the webview, so we snapshot the QuickPick item list rendered as a
// trivial HTML fragment (acceptable per ADR-0012: HTML normalization only).

import type { Task, Session } from '@tackle/shared';
import { initialState, type SidebarState } from '../../src/sidebar/sidebar-state';
import { render } from '../../src/sidebar/render';
import { buildKindQuickPickItems } from '../../src/session/pick-kind';

const ACTIVATED: SidebarState = { ...initialState, isActivated: true };

export function task(id: number, title: string, over: Partial<Task> = {}): Task {
  return {
    id,
    external_id: String(id),
    external_system: 'github',
    title,
    description: '',
    status: 'open',
    assignee: null,
    parent_external_id: null,
    worktree_path: null,
    worktree_branch: null,
    worktree_base_branch: null,
    synced_at: '2026-04-01',
    created_at: '2026-04-01',
    ...over,
  };
}

export function sess(id: number, task_id: number, over: Partial<Session> = {}): Session {
  return {
    id,
    task_id,
    phase_id: null,
    name: `s${id}`,
    kind: 'implement',
    status: 'running',
    psmux_name: `p${id}`,
    tab_label: `session-${id}`,
    agent: null,
    worktree_path: null,
    sort_order: 0,
    claude_session_id: null,
    agent_state: 'idle',
    prior_claude_session_ids: null,
    started_at: '',
    ended_at: null,
    ...over,
  };
}

// ---- 13 named states ----

export interface NamedFixture {
  name: string;
  /** Returns the raw HTML to be normalized + snapshotted. */
  html: () => string;
}

export const FIXTURES: NamedFixture[] = [
  {
    name: 'list-mode-empty',
    html: () => render({ ...ACTIVATED }),
  },
  {
    name: 'list-mode-idle-task',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Idle task')],
      }),
  },
  {
    name: 'list-mode-waiting-task',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Task awaiting input')],
        sessions: [sess(10, 1, { status: 'running', agent_state: 'waiting' })],
      }),
  },
  {
    name: 'list-mode-expanded-card',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Big task')],
        sessions: [
          sess(10, 1, { status: 'running', agent_state: 'working', tab_label: 'impl-1' }),
          sess(11, 1, { status: 'running', agent_state: 'idle', tab_label: 'impl-2' }),
        ],
        expandedCardIds: new Set([1]),
        activeTaskId: 1,
      }),
  },
  {
    name: 'closed-folder-collapsed',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [
          task(1, 'Open A'),
          task(2, 'Closed A', { status: 'closed' }),
          task(3, 'Closed B', { status: 'done' }),
        ],
        closedFolderOpen: false,
      }),
  },
  {
    name: 'closed-folder-expanded',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [
          task(1, 'Open A'),
          task(2, 'Closed A', { status: 'closed' }),
          task(3, 'Closed B', { status: 'done' }),
        ],
        closedFolderOpen: true,
      }),
  },
  {
    name: 'detail-mode-with-breadcrumb',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(7, 'Detail task')],
        sessions: [],
        mode: { kind: 'detail', taskId: 7 },
      }),
  },
  {
    name: 'detail-mode-with-sessions-and-footer',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(7, 'Detail task with sessions')],
        sessions: [
          sess(70, 7, { status: 'running', agent_state: 'working', tab_label: 'impl' }),
          sess(71, 7, { status: 'running', agent_state: 'waiting', tab_label: 'review' }),
          sess(72, 7, { status: 'completed', tab_label: 'done' }),
        ],
        mode: { kind: 'detail', taskId: 7 },
        activeTaskId: 7,
      }),
  },
  {
    name: 'session-kind-quickpick',
    html: () => {
      const items = buildKindQuickPickItems();
      const lis = items
        .map((it) => `<li data-kind="${it.kind}">${it.label}</li>`)
        .join('');
      return `<div class="quickpick session-kind-quickpick"><ul>${lis}</ul></div>`;
    },
  },
  {
    name: 'card-state-active',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Active card')],
        sessions: [sess(10, 1, { status: 'running', agent_state: 'idle' })],
        activeTaskId: 1,
      }),
  },
  {
    name: 'card-state-running',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Running card'), task(2, 'Active card')],
        sessions: [
          sess(10, 1, { status: 'running', agent_state: 'working' }),
          sess(20, 2, { status: 'running', agent_state: 'idle' }),
        ],
        activeTaskId: 2,
      }),
  },
  {
    name: 'card-state-closed',
    html: () =>
      render({
        ...ACTIVATED,
        tasks: [task(1, 'Closed card', { status: 'closed' })],
        closedFolderOpen: true,
      }),
  },
  {
    name: 'card-state-hover',
    html: () => {
      // The :hover pseudo class is CSS-only; we render the .card--hover sibling
      // class on a card to capture the hover style branch.
      const html = render({
        ...ACTIVATED,
        tasks: [task(1, 'Hovered card')],
      });
      // Patch in the hover class on the rendered card. The renderer always emits
      // class="card …" on the top-level card div; this is a deterministic edit.
      return html.replace('class="card', 'class="card card--hover');
    },
  },
];
