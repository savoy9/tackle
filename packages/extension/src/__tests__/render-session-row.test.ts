import { describe, it, expect } from 'vitest';
import type { Session } from '@tackle/shared';
import {
  renderSessionRow,
  renderSessionRows,
  SESSION_ROW_DETAIL_CLASS,
} from '../sidebar/render-session-row';

const sess = (id: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id: 1,
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

describe('renderSessionRow — surface-dependent button visibility (#47)', () => {
  it('default surface is list-expanded: produces base session-row, no detail modifier', () => {
    const html = renderSessionRow(sess(10));
    expect(html).toContain('class="session-row"');
    expect(html).not.toContain(SESSION_ROW_DETAIL_CLASS);
  });

  it('list-expanded surface (explicit): produces base session-row, no detail modifier', () => {
    const html = renderSessionRow(sess(10), { surface: 'list-expanded' });
    expect(html).toContain('class="session-row"');
    expect(html).not.toContain(SESSION_ROW_DETAIL_CLASS);
  });

  it('detail surface: row carries the detail modifier class so CSS can hover-reveal buttons', () => {
    const html = renderSessionRow(sess(10), { surface: 'detail' });
    expect(html).toContain(SESSION_ROW_DETAIL_CLASS);
    // Buttons themselves are still rendered — visibility is CSS-driven.
    expect(html).toMatch(/data-action="stopSession"/);
    expect(html).toMatch(/data-action="markSessionDone"/);
    expect(html).toMatch(/data-action="sessionOverflow"/);
  });

  it('renderSessionRows propagates the surface flag to every row', () => {
    const html = renderSessionRows([sess(10), sess(11, { status: 'completed' })], {
      surface: 'detail',
    });
    // Both rows should carry the detail modifier.
    const matches = html.match(new RegExp(SESSION_ROW_DETAIL_CLASS, 'g'));
    expect(matches?.length).toBe(2);
  });

  it('renderSessionRows defaults to list-expanded surface when no opts passed', () => {
    const html = renderSessionRows([sess(10)]);
    expect(html).not.toContain(SESSION_ROW_DETAIL_CLASS);
  });
});
