import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import { renderDetail } from '../sidebar/render-detail';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';
import { SESSION_ROW_DETAIL_CLASS } from '../sidebar/render-session-row';
import { EDGE_BAR_CLASS, EDGE_BAR_SOFT_CLASS } from '../sidebar/edge-bar';

const task = (id: number, title: string, over: Partial<Task> = {}): Task => ({
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
});

const sess = (id: number, taskId: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id: taskId,
  phase_id: null,
  name: `s${id}`,
  kind: 'implement',
  status: 'running',
  psmux_name: `p${id}`,
  tab_label: `tab-${id}`,
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

function detailState(over: Partial<SidebarState> = {}): SidebarState {
  return {
    ...initialState,
    tasks: [task(1, 'Primary')],
    mode: { kind: 'detail', taskId: 1 },
    ...over,
  };
}

describe('renderDetail — outer Active card surface (#47)', () => {
  it('wraps the detail surface in a single outer card with Active treatment', () => {
    const html = renderDetail(detailState());
    // Single outer card element with both card + card--active classes.
    expect(html).toMatch(/class="tackle-detail card card--active"/);
  });

  it('section micro-labels render at the documented size/weight class', () => {
    const html = renderDetail(detailState({ sessions: [sess(10, 1)] }));
    expect(html).toContain('class="detail-sessions-label section-micro-label"');
  });
});

describe('renderDetail — Detail Mode session rows (#47)', () => {
  it('session rows in Detail Mode carry the detail surface modifier class', () => {
    const html = renderDetail(detailState({ sessions: [sess(10, 1)] }));
    expect(html).toContain(SESSION_ROW_DETAIL_CLASS);
  });

  it('the detail card has no internal section borders (border-top removed)', () => {
    // The outer detail container does not emit explicit border classes
    // between sections — separators are whitespace only.
    const html = renderDetail(detailState({ sessions: [sess(10, 1)] }));
    expect(html).not.toContain('detail-footer-rule');
  });
});

describe('renderDetail — description area (#47)', () => {
  it('renders detail-description container even when no precomputed HTML', () => {
    const html = renderDetail(detailState());
    expect(html).toContain('class="detail-description"');
  });

  it('renders precomputed HTML inside the description container', () => {
    const html = renderDetail(
      detailState({ descriptionsByTaskId: { 1: '<p>hi</p>' } }),
    );
    expect(html).toContain('<p>hi</p>');
  });
});

describe('renderDetail — Task Footer mini-cards (#47)', () => {
  it('renders other tasks as mini-card primitives (card class with footer modifier)', () => {
    const state = detailState({
      tasks: [task(1, 'Primary'), task(2, 'Other A'), task(3, 'Other B')],
    });
    const html = renderDetail(state);
    expect(html).toContain('class="detail-footer"');
    // Each footer row should be a card with the mini modifier.
    expect(html).toMatch(/class="card card--mini"[^>]*data-action="switchDetailTo"[^>]*data-task-id="2"/);
    expect(html).toMatch(/data-task-id="3"/);
  });

  it('mini-card displays a soft Edge Bar when the corresponding task has a running session', () => {
    const state = detailState({
      tasks: [task(1, 'Primary'), task(2, 'Other A')],
      sessions: [sess(99, 2, { status: 'running' })],
    });
    const html = renderDetail(state);
    // The other task (id 2) has a running session → its footer mini-card
    // should include a soft Edge Bar.
    expect(html).toContain(EDGE_BAR_CLASS);
    expect(html).toContain(EDGE_BAR_SOFT_CLASS);
  });

  it('mini-card does NOT include an Edge Bar when the task has no running sessions', () => {
    const state = detailState({
      tasks: [task(1, 'Primary'), task(2, 'Other A')],
      sessions: [sess(99, 2, { status: 'completed' })],
    });
    const html = renderDetail(state);
    // Footer row for task 2 should not have an edge-bar element.
    // We slice from the footer onward and check.
    const footerIdx = html.indexOf('class="detail-footer"');
    expect(footerIdx).toBeGreaterThan(-1);
    const footerHtml = html.slice(footerIdx);
    expect(footerHtml).not.toContain(EDGE_BAR_CLASS);
  });

  it('omits footer when there are no other tasks', () => {
    const html = renderDetail(detailState());
    expect(html).not.toContain('class="detail-footer"');
  });
});
