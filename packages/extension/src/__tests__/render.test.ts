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
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: "not_started",
  synced_at: '',
  created_at: '',
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

describe('render — general', () => {
  it('returns a string', () => {
    expect(typeof render(initialState)).toBe('string');
  });

  it('uses Tackle theme tokens (not VS Code color vars) (#45)', () => {
    const html = render(initialState);
    expect(html).toMatch(/var\(--tk-/);
    // Component CSS for color uses --tk-* only. VS Code vars are still
    // permitted for font props and inside HC token blocks as fallbacks.
    // Spot-check: no .card or .session-row rule mentions --vscode- for color.
    expect(html).not.toMatch(/var\(--vscode-list-/);
    expect(html).not.toMatch(/var\(--vscode-focusBorder/);
  });

  it('renders an empty list', () => {
    // When the extension is activated, empty task list shows "No tasks".
    const activated: SidebarState = { ...initialState, isActivated: true };
    expect(render(activated)).toContain('No tasks');
  });

  it('renders an Activate button when isActivated is false', () => {
    const html = render(initialState);
    expect(html).toContain('data-action="activateExtension"');
    expect(html).toContain('Tackle is not activated');
  });

  it('does not render the Activate button when isActivated is true', () => {
    const state: SidebarState = {
      ...initialState,
      isActivated: true,
      tasks: [task(1, 'foo')],
    };
    const html = render(state);
    expect(html).not.toContain('data-action="activateExtension"');
  });

  it('escapes HTML in task titles', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, '<script>alert(1)</script>')] };
    const html = render(state);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('render — Card Line 1 (glyph + title + activate + overflow)', () => {
  it('renders activity glyph span for the task', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [session(10, 1, { agent_state: 'waiting' })],
    };
    const html = render(state);
    expect(html).toContain('class="glyph"');
    expect(html).toContain('✳️');
  });

  it('renders task title as a click target that enters detail', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, 'Hello')] };
    const html = render(state);
    expect(html).toMatch(
      /data-action="enterDetail"[^>]*data-task-id="1"|data-task-id="1"[^>]*data-action="enterDetail"/,
    );
    expect(html).toContain('Hello');
  });

  it('renders Activate button on non-Active cards', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'B')],
      activeTaskId: 2,
    };
    const html = render(state);
    // Card 1 non-active: Activate button present with data-action=activateTask data-task-id=1
    expect(html).toMatch(/data-action="activateTask"[^>]*data-task-id="1"/);
    // Card 2 active: no activate button for id=2
    expect(html).not.toMatch(/data-action="activateTask"[^>]*data-task-id="2"/);
  });

  it('renders ⋯ overflow button on every card', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, 'A')] };
    const html = render(state);
    expect(html).toMatch(/data-action="taskOverflow"[^>]*data-task-id="1"/);
  });
});

describe('render — Card Line 2 (ext icon + #id + parent)', () => {
  it('shows external-system marker and #external_id', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T', { external_id: '42', external_system: 'github' })],
    };
    const html = render(state);
    expect(html).toContain('#42');
    expect(html).toContain('class="ext-icon"');
  });

  it('renders parent label when parent_external_id is set', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T', { parent_external_id: '99' })],
    };
    const html = render(state);
    expect(html).toContain('class="parent"');
    expect(html).toContain('#99');
  });

  it('omits parent label when parent_external_id is null', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, 'T')] };
    const html = render(state);
    expect(html).not.toContain('class="parent"');
  });
});

describe('render — Card Line 3 (session rollup + branch | + New session)', () => {
  it('renders session-rollup counts when sessions exist', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [
        session(10, 1, { status: 'running', agent_state: 'idle' }),
        session(11, 1, { status: 'completed' }),
      ],
    };
    const html = render(state);
    expect(html).toContain('class="rollup"');
  });

  it('shows + New session affordance when a task has zero sessions', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, 'T')] };
    const html = render(state);
    expect(html).toContain('+ New session');
    expect(html).toMatch(/data-action="newSession"[^>]*data-task-id="1"/);
  });
});

describe('render — Active marker class (state matrix is #46)', () => {
  it('active task has card--active class on the card element', () => {
    const state: SidebarState = { ...initialState, tasks: [task(1, 'A')], activeTaskId: 1 };
    const html = render(state);
    expect(html).toMatch(/class="card card--active"[^>]*data-task-id="1"/);
  });

  it('non-active task does not have .active class', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'B')],
      activeTaskId: 1,
    };
    const html = render(state);
    expect(html).toMatch(/class="card"[^>]*data-task-id="2"/);
  });

  it('idle Task Card primitive uses --tk-card-bg fill (#45)', () => {
    const html = render(initialState);
    expect(html).toMatch(/\.card\s*\{[^}]*background:\s*var\(--tk-card-bg\)/);
    expect(html).toMatch(/\.card\s*\{[^}]*border-radius:\s*var\(--tk-radius-card\)/);
  });
});

describe('render — expansion with Session Rows', () => {
  it('does not render session rows for a collapsed card', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [session(10, 1)],
    };
    const html = render(state);
    expect(html).not.toContain('class="session-row"');
  });

  it('renders session rows beneath the card when expanded', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [session(10, 1)],
      expandedCardIds: new Set([1]),
    };
    const html = render(state);
    expect(html).toContain('class="session-row"');
    expect(html).toContain('data-session-id="10"');
    expect(html).toContain('session-10');
  });

  it('session row has Stop and Mark-done icons', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [session(10, 1)],
      expandedCardIds: new Set([1]),
    };
    const html = render(state);
    expect(html).toMatch(/data-action="stopSession"[^>]*data-session-id="10"/);
    expect(html).toMatch(/data-action="markSessionDone"[^>]*data-session-id="10"/);
    expect(html).toMatch(/data-action="sessionOverflow"[^>]*data-session-id="10"/);
  });

  it('groups active sessions above divider and stopped/completed below', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'T')],
      sessions: [
        session(10, 1, { status: 'running' }),
        session(11, 1, { status: 'stopped' }),
        session(12, 1, { status: 'completed' }),
      ],
      expandedCardIds: new Set([1]),
    };
    const html = render(state);
    // The row for id=10 (running) must appear before the divider; 11 and 12 after.
    const idx10 = html.indexOf('data-session-id="10"');
    const div = html.indexOf('class="session-divider"');
    const idx11 = html.indexOf('data-session-id="11"');
    const idx12 = html.indexOf('data-session-id="12"');
    expect(idx10).toBeGreaterThan(0);
    expect(div).toBeGreaterThan(idx10);
    expect(idx11).toBeGreaterThan(div);
    expect(idx12).toBeGreaterThan(div);
  });
});

describe('render — detail mode (unchanged)', () => {
  it('renders detail with title and Back', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'B')],
      mode: { kind: 'detail', taskId: 2 },
    };
    const html = render(state);
    expect(html).toContain('Detail');
    expect(html).toContain('B');
    expect(html).toContain('Back');
  });
});
