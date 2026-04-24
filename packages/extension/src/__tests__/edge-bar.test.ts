import { describe, it, expect } from 'vitest';
import type { Task, Session } from '@tackle/shared';
import {
  deriveEdgeBarState,
  EDGE_BAR_CLASS,
  EDGE_BAR_OFF_CLASS,
  EDGE_BAR_SOFT_CLASS,
  EDGE_BAR_SOLID_CLASS,
} from '../sidebar/edge-bar';

const task = (id: number, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title: `t${id}`,
  description: '',
  status: 'open',
  assignee: null,
  parent_external_id: null,
  synced_at: '',
  created_at: '',
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

describe('deriveEdgeBarState (#46)', () => {
  it('returns "off" for a Task with zero Sessions', () => {
    expect(deriveEdgeBarState(task(1), [], false)).toBe('off');
    expect(deriveEdgeBarState(task(1), [], true)).toBe('off');
  });

  it('returns "off" when all sessions are completed/stopped', () => {
    const ss = [
      sess(10, 1, { status: 'completed' }),
      sess(11, 1, { status: 'stopped' }),
    ];
    expect(deriveEdgeBarState(task(1), ss, false)).toBe('off');
    expect(deriveEdgeBarState(task(1), ss, true)).toBe('off');
  });

  it('returns "soft" for a non-Active Task with at least one running Session', () => {
    const ss = [sess(10, 1, { status: 'completed' }), sess(11, 1, { status: 'running' })];
    expect(deriveEdgeBarState(task(1), ss, false)).toBe('soft');
  });

  it('returns "solid" for the Active Task with at least one running Session', () => {
    const ss = [sess(10, 1, { status: 'running' })];
    expect(deriveEdgeBarState(task(1), ss, true)).toBe('solid');
  });

  it('exports stable CSS class-name constants', () => {
    expect(EDGE_BAR_CLASS).toBe('edge-bar');
    expect(EDGE_BAR_OFF_CLASS).toBe('edge-bar--off');
    expect(EDGE_BAR_SOFT_CLASS).toBe('edge-bar--soft');
    expect(EDGE_BAR_SOLID_CLASS).toBe('edge-bar--solid');
  });
});
