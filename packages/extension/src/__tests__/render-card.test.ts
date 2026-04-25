import { describe, it, expect } from 'vitest';
import { renderCard } from '../sidebar/render-card';
import { EDGE_BAR_CLASS, EDGE_BAR_SOFT_CLASS, EDGE_BAR_SOLID_CLASS } from '../sidebar/edge-bar';
import type { Task, Session } from '@tackle/shared';

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
  tackle_status: "not_started",
  synced_at: '',
  created_at: '',
  ...over,
});

describe('renderCard — idle primitive (#45)', () => {
  it('renders an <li class="card"> with task data', () => {
    const html = renderCard(task(1, 'Hello'), [], false, false);
    expect(html).toContain('Hello');
    expect(html).toContain('class="card"');
    expect(html).toMatch(/data-task-id="1"/);
  });

  it('renders the +New session affordance when sessions list is empty', () => {
    const html = renderCard(task(1, 'X'), [], false, false);
    expect(html).toContain('+ New session');
  });

  it('produces a session-rows block when expanded with sessions', () => {
    const sess: Session = {
      id: 10,
      task_id: 1,
      phase_id: null,
      name: 's10',
      kind: 'implement',
      status: 'running',
      psmux_name: 'p10',
      tab_label: 'tab10',
      agent: null,
      worktree_path: null,
      sort_order: 0,
      claude_session_id: null,
      agent_state: 'idle',
      prior_claude_session_ids: null,
      started_at: '',
      ended_at: null,
    };
    const html = renderCard(task(1, 'X'), [sess], false, true);
    expect(html).toContain('class="session-row"');
  });
});

const runningSess = (id: number, taskId: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id: taskId,
  phase_id: null,
  name: `s${id}`,
  kind: 'implement',
  status: 'running',
  psmux_name: `p${id}`,
  tab_label: `tab${id}`,
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

describe('renderCard — state matrix (#46)', () => {
  it('Active card carries card--active and a solid Edge Bar element', () => {
    const html = renderCard(task(1, 'A'), [runningSess(10, 1)], true, false);
    expect(html).toContain('card--active');
    expect(html).not.toContain('card--running');
    expect(html).toContain(EDGE_BAR_CLASS);
    expect(html).toContain(EDGE_BAR_SOLID_CLASS);
  });

  it('Non-Active card with a running session carries card--running and a soft Edge Bar', () => {
    const html = renderCard(task(1, 'R'), [runningSess(10, 1)], false, false);
    expect(html).toContain('card--running');
    expect(html).not.toContain('card--active');
    expect(html).toContain(EDGE_BAR_SOFT_CLASS);
  });

  it('Idle card (no sessions, not active) carries no state modifier and no Edge Bar element', () => {
    const html = renderCard(task(1, 'I'), [], false, false);
    expect(html).not.toContain('card--active');
    expect(html).not.toContain('card--running');
    expect(html).not.toContain(EDGE_BAR_CLASS);
  });

  it('Active + Running modifiers are mutually exclusive', () => {
    const html = renderCard(task(1, 'A'), [runningSess(10, 1)], true, false);
    const hasActive = html.includes('card--active');
    const hasRunning = html.includes('card--running');
    expect(hasActive).toBe(true);
    expect(hasRunning).toBe(false);
  });
});
