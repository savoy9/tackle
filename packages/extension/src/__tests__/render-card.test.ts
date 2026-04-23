import { describe, it, expect } from 'vitest';
import { renderCard } from '../sidebar/render-card';
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
      id: 10, task_id: 1, phase_id: null, name: 's10', kind: 'implement',
      status: 'running', psmux_name: 'p10', tab_label: 'tab10', agent: null,
      worktree_path: null, sort_order: 0, claude_session_id: null,
      agent_state: 'idle', prior_claude_session_ids: null,
      started_at: '', ended_at: null,
    };
    const html = renderCard(task(1, 'X'), [sess], false, true);
    expect(html).toContain('class="session-row"');
  });
});
