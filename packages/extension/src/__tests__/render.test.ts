import { describe, it, expect } from 'vitest';
import type { Task } from '@tackle/shared';
import { render } from '../sidebar/render';
import { initialState, type SidebarState } from '../sidebar/sidebar-state';

const task = (id: number, title: string): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  synced_at: '',
  created_at: '',
});

describe('render', () => {
  it('returns a string', () => {
    expect(typeof render(initialState)).toBe('string');
  });

  it('renders empty list state (no tasks)', () => {
    expect(render(initialState)).toMatchSnapshot();
  });

  it('renders list mode with several tasks (titles only)', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'Fix bug'), task(2, 'Add feature'), task(3, 'Write docs')],
      activeTaskId: 2,
    };
    const html = render(state);
    expect(html).toContain('Fix bug');
    expect(html).toContain('Add feature');
    expect(html).toContain('Write docs');
    // titles only — must NOT contain status or external_id markers
    expect(html).not.toContain('#1');
    expect(html).not.toContain('#2');
    expect(html).toMatchSnapshot();
  });

  it('renders detail mode with title + Back', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'Fix bug'), task(2, 'Add feature')],
      mode: { kind: 'detail', taskId: 2 },
    };
    const html = render(state);
    expect(html).toContain('Detail');
    expect(html).toContain('Add feature');
    expect(html).toContain('Back');
    expect(html).toMatchSnapshot();
  });

  it('escapes HTML in task titles', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, '<script>alert(1)</script>')],
    };
    const html = render(state);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('uses VS Code theme CSS vars', () => {
    const html = render(initialState);
    expect(html).toMatch(/var\(--vscode-/);
  });

  it('marks the active task', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(1, 'A'), task(2, 'B')],
      activeTaskId: 2,
    };
    const html = render(state);
    expect(html).toMatch(/data-task-id="2"[^>]*\bactive\b|active[^>]*data-task-id="2"/);
  });

  it('click targets carry data-task-id for delegation', () => {
    const state: SidebarState = {
      ...initialState,
      tasks: [task(11, 'Eleven')],
    };
    const html = render(state);
    expect(html).toContain('data-task-id="11"');
  });
});
