import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { render } from '../sidebar/render';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';

const task = (id: number, title: string, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  synced_at: '2026-04-01',
  created_at: '2026-04-01',
  ...over,
});

const sess = (id: number, task_id: number, over: Partial<Session> = {}): Session => ({
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
});

function detailState(overrides: Partial<SidebarState> = {}): SidebarState {
  return {
    ...initialState,
    tasks: [task(1, 'Primary task', { external_id: '42', description: 'Hello **world**' })],
    mode: { kind: 'detail', taskId: 1 },
    ...overrides,
  };
}

describe('render — Detail Header', () => {
  it('renders Back button with exitDetail action', () => {
    const html = render(detailState());
    expect(html).toMatch(/data-action="exitDetail"/);
    expect(html).toMatch(/◀|Back/);
  });

  it('renders task title prominently', () => {
    const html = render(detailState());
    expect(html).toContain('Primary task');
    expect(html).toMatch(/class="detail-title"/);
  });

  it('renders ⋯ overflow button for the task', () => {
    const html = render(detailState());
    expect(html).toMatch(/data-action="taskOverflow"[^>]*data-task-id="1"/);
  });
});

describe('render — Detail Subhead: breadcrumb + identity', () => {
  it('renders identity line: external icon + #id + status', () => {
    const state = detailState({
      tasks: [task(1, 'X', { external_id: '42', external_system: 'github', status: 'open' })],
    });
    const html = render(state);
    expect(html).toContain('class="detail-identity"');
    expect(html).toContain('#42');
    expect(html).toMatch(/GH|github/i);
    expect(html).toContain('open');
  });

  it('renders assignee when present in identity line', () => {
    const state = detailState({
      tasks: [task(1, 'X', { assignee: 'alice' })],
    });
    const html = render(state);
    expect(html).toContain('alice');
  });

  it('renders parent breadcrumb when parent_external_id is set', () => {
    const state = detailState({
      tasks: [task(1, 'X', { parent_external_id: '99' })],
    });
    const html = render(state);
    expect(html).toContain('class="detail-breadcrumb"');
    expect(html).toContain('#99');
  });

  it('omits breadcrumb when parent_external_id is null', () => {
    const html = render(detailState());
    expect(html).not.toContain('class="detail-breadcrumb"');
  });
});

describe('render — Detail Subhead: branch line', () => {
  it('renders branch line with 🌿 when a session has a worktree_path', () => {
    const state = detailState({
      sessions: [sess(10, 1, { worktree_path: '/path/to/feature-foo' })],
    });
    const html = render(state);
    expect(html).toContain('class="detail-branch"');
    expect(html).toContain('🌿');
    expect(html).toContain('feature-foo');
  });

  it('omits branch line when no session has a worktree_path', () => {
    const state = detailState({
      sessions: [sess(10, 1, { worktree_path: null })],
    });
    const html = render(state);
    expect(html).not.toContain('class="detail-branch"');
  });

  it('omits branch line when no sessions at all', () => {
    const html = render(detailState());
    expect(html).not.toContain('class="detail-branch"');
  });
});

describe('render — Detail: externally-closed indicator', () => {
  it('renders indicator when task is closed AND has ≥1 running session', () => {
    const state = detailState({
      tasks: [task(1, 'X', { status: 'closed' })],
      sessions: [sess(10, 1, { status: 'running' })],
    });
    const html = render(state);
    expect(html).toContain('class="detail-closed-indicator"');
    expect(html).toMatch(/Externally closed/);
    expect(html).toMatch(/1 session/);
  });

  it('omits indicator when task is open', () => {
    const state = detailState({
      sessions: [sess(10, 1, { status: 'running' })],
    });
    const html = render(state);
    expect(html).not.toContain('class="detail-closed-indicator"');
  });

  it('omits indicator when closed but no running sessions', () => {
    const state = detailState({
      tasks: [task(1, 'X', { status: 'closed' })],
      sessions: [sess(10, 1, { status: 'stopped' })],
    });
    const html = render(state);
    expect(html).not.toContain('class="detail-closed-indicator"');
  });
});

describe('render — Detail: description area', () => {
  it('renders precomputed HTML from descriptionsByTaskId', () => {
    const state: SidebarState = {
      ...detailState(),
      descriptionsByTaskId: { 1: '<p>Hello <strong>world</strong></p>' },
    };
    const html = render(state);
    expect(html).toContain('class="detail-description"');
    expect(html).toContain('<strong>world</strong>');
  });

  it('renders empty description area when no HTML is precomputed', () => {
    const html = render(detailState());
    expect(html).toContain('class="detail-description"');
  });

  it('reserves has_plan branch (MVP always false)', () => {
    // The description branch should not include any plan-tracker markers for MVP.
    const html = render(detailState());
    expect(html).not.toContain('plan-tracker');
  });
});

describe('render — Detail: Sessions section', () => {
  it('renders Sessions header with + button that triggers newSession for this task', () => {
    const state = detailState({
      sessions: [sess(10, 1)],
    });
    const html = render(state);
    expect(html).toContain('class="detail-sessions"');
    expect(html).toMatch(/Sessions/);
    expect(html).toMatch(/data-action="newSession"[^>]*data-task-id="1"/);
  });

  it('renders session rows for current task using same markup as List Mode', () => {
    const state = detailState({
      sessions: [sess(10, 1), sess(20, 2)],
    });
    const html = render(state);
    expect(html).toContain('data-session-id="10"');
    expect(html).not.toContain('data-session-id="20"');
    expect(html).toMatch(/data-action="stopSession"[^>]*data-session-id="10"/);
  });

  it('renders empty sessions list gracefully', () => {
    const html = render(detailState());
    expect(html).toContain('class="detail-sessions"');
  });
});

describe('render — Detail: Task Footer', () => {
  it('lists up to 5 OTHER tasks sorted by activity, current excluded', () => {
    const tasks = [
      task(1, 'Current', { synced_at: '2026-04-10' }),
      task(2, 'T2', { synced_at: '2026-04-09' }),
      task(3, 'T3', { synced_at: '2026-04-08' }),
      task(4, 'T4', { synced_at: '2026-04-07' }),
      task(5, 'T5', { synced_at: '2026-04-06' }),
      task(6, 'T6', { synced_at: '2026-04-05' }),
      task(7, 'T7', { synced_at: '2026-04-04' }),
    ];
    const state: SidebarState = {
      ...initialState,
      tasks,
      mode: { kind: 'detail', taskId: 1 },
    };
    const html = render(state);
    expect(html).toContain('class="detail-footer"');
    expect(html).not.toMatch(/data-action="switchDetailTo"[^>]*data-task-id="1"/);
    // All 6 others: 5 visible rows, the 6th also present (scrollable list)
    expect(html).toContain('T2');
    // switchDetailTo action
    expect(html).toMatch(/data-action="switchDetailTo"[^>]*data-task-id="2"/);
  });

  it('omits footer section when there are no other tasks', () => {
    const html = render(detailState());
    expect(html).not.toContain('class="detail-footer"');
  });
});
