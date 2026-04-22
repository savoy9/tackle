import { describe, it, expect } from 'vitest';
import type { Session } from '@tackle/shared';
import { rollupGlyph, sessionGlyph, type Glyph } from '../sidebar/glyph';

const s = (over: Partial<Session>): Session => ({
  id: 1,
  task_id: 1,
  phase_id: null,
  name: 's',
  kind: 'implement',
  status: 'running',
  psmux_name: 'p',
  tab_label: 't',
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

describe('sessionGlyph', () => {
  it('returns ✳️ when agent_state=waiting', () => {
    expect(sessionGlyph(s({ agent_state: 'waiting', status: 'running' }))).toBe('✳️' as Glyph);
  });
  it('returns ⏳ when agent_state=working', () => {
    expect(sessionGlyph(s({ agent_state: 'working', status: 'running' }))).toBe('⏳' as Glyph);
  });
  it('returns ● when running+idle', () => {
    expect(sessionGlyph(s({ agent_state: 'idle', status: 'running' }))).toBe('●' as Glyph);
  });
  it('returns ✔️ when completed', () => {
    expect(sessionGlyph(s({ status: 'completed' }))).toBe('✔️' as Glyph);
  });
  it('returns 🚫 when stopped', () => {
    expect(sessionGlyph(s({ status: 'stopped' }))).toBe('🚫' as Glyph);
  });
});

describe('rollupGlyph', () => {
  it('returns ○ for empty sessions list', () => {
    expect(rollupGlyph([])).toBe('○' as Glyph);
  });
  it('✳️ beats everything', () => {
    expect(
      rollupGlyph([
        s({ agent_state: 'working', status: 'running' }),
        s({ agent_state: 'waiting', status: 'running' }),
        s({ status: 'completed' }),
      ]),
    ).toBe('✳️' as Glyph);
  });
  it('⏳ beats ● ✔️ 🚫', () => {
    expect(
      rollupGlyph([
        s({ agent_state: 'working', status: 'running' }),
        s({ agent_state: 'idle', status: 'running' }),
        s({ status: 'stopped' }),
      ]),
    ).toBe('⏳' as Glyph);
  });
  it('● beats ✔️-only and 🚫-only', () => {
    expect(
      rollupGlyph([
        s({ agent_state: 'idle', status: 'running' }),
        s({ status: 'completed' }),
      ]),
    ).toBe('●' as Glyph);
  });
  it('✔️-only when all sessions are completed', () => {
    expect(
      rollupGlyph([s({ status: 'completed' }), s({ status: 'completed' })]),
    ).toBe('✔️' as Glyph);
  });
  it('✔️-only beats 🚫-only when mixed completed+stopped', () => {
    expect(
      rollupGlyph([s({ status: 'completed' }), s({ status: 'stopped' })]),
    ).toBe('✔️' as Glyph);
  });
  it('🚫-only when all sessions are stopped', () => {
    expect(rollupGlyph([s({ status: 'stopped' })])).toBe('🚫' as Glyph);
  });
});
