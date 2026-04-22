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

const session = (id: number, task_id: number, over: Partial<Session> = {}): Session => ({
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

describe('render — Closed Issues Folder (#30)', () => {
  it('renders header count "N open · M closed"', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'B', { status: 'closed' }), task(3, 'C', { status: 'done' }), task(4, 'D', { status: 'open' })],
    };
    const html = render(state);
    expect(html).toContain('2 open · 2 closed');
  });

  it('zero-count header still renders with 0 open · 0 closed when tasks empty? only when list has entries', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A', { status: 'closed' })],
    };
    const html = render(state);
    expect(html).toContain('0 open · 1 closed');
  });

  it('excludes closed tasks from the main card list', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'OpenTask'), task(2, 'ClosedOne', { status: 'closed' })],
    };
    const html = render(state);
    // Main list should contain OpenTask as a card, not ClosedOne as a card.
    const cardListMatch = html.match(/<ul class="card-list">([\s\S]*?)<\/ul>/);
    expect(cardListMatch).toBeTruthy();
    expect(cardListMatch![1]).toContain('OpenTask');
    expect(cardListMatch![1]).not.toContain('ClosedOne');
  });

  it('renders collapsed folder row with ▸ and (N) count, clickable to toggle', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'C1', { status: 'closed' }), task(3, 'C2', { status: 'done' })],
      closedFolderOpen: false,
    };
    const html = render(state);
    expect(html).toMatch(/data-action="toggleClosedFolder"/);
    expect(html).toContain('▸');
    expect(html).toContain('Closed (2)');
    // No compressed rows when collapsed.
    expect(html).not.toContain('C1');
  });

  it('renders expanded folder with ▾ and compressed rows', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [
        task(1, 'A'),
        task(2, 'ClosedOne', { status: 'closed', synced_at: '2026-03-15' }),
        task(3, 'ClosedTwo', { status: 'done', synced_at: '2026-03-20' }),
      ],
      closedFolderOpen: true,
    };
    const html = render(state);
    expect(html).toContain('▾');
    expect(html).toContain('Closed (2)');
    expect(html).toContain('ClosedOne');
    expect(html).toContain('ClosedTwo');
    // Compressed rows include #id and date
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).toContain('2026-03-15');
  });

  it('compressed row click enters detail for the task', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(2, 'ClosedOne', { status: 'closed' })],
      closedFolderOpen: true,
    };
    const html = render(state);
    // Expect a closed-row element with data-action=enterDetail and data-task-id
    expect(html).toMatch(/class="closed-row"[^>]*data-action="enterDetail"[^>]*data-task-id="2"|data-task-id="2"[^>]*data-action="enterDetail"[^>]*class="closed-row"|data-action="enterDetail"[^>]*data-task-id="2"/);
  });

  it('sorts closed tasks by updated_at descending', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [
        task(10, 'Older', { status: 'closed', synced_at: '2026-01-01' }),
        task(11, 'Newer', { status: 'closed', synced_at: '2026-02-01' }),
      ],
      closedFolderOpen: true,
    };
    const html = render(state);
    const iNewer = html.indexOf('Newer');
    const iOlder = html.indexOf('Older');
    expect(iNewer).toBeGreaterThan(-1);
    expect(iOlder).toBeGreaterThan(iNewer);
  });

  it('does not render folder row when there are no closed tasks', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A')],
    };
    const html = render(state);
    expect(html).not.toMatch(/toggleClosedFolder/);
  });
});
