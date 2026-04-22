import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, SessionRepository } from '@tackle/shared';
import { SessionTreeProvider, SessionTreeItem } from '../session/session-tree-provider';

const mockSessions: Session[] = [
  { id: 1, task_id: 42, phase_id: null, name: 'impl-1', kind: 'implement', status: 'running', psmux_name: 'tackle-gh-42-implement1', tab_label: '42-Auth|implement1', agent: null, worktree_path: null, sort_order: 1, claude_session_id: null, started_at: '2026-01-01', ended_at: null },
  { id: 2, task_id: 42, phase_id: null, name: 'shell-1', kind: 'shell', status: 'stopped', psmux_name: 'tackle-gh-42-shell1', tab_label: '42-Auth|shell1', agent: null, worktree_path: null, sort_order: 2, claude_session_id: null, started_at: '2026-01-01', ended_at: '2026-01-02' },
];

function createMockSessionRepo(sessions: Session[]): SessionRepository {
  return {
    list: async () => sessions,
    listForTask: async (taskId: number) => sessions.filter(s => s.task_id === taskId),
    get: async (id: number) => sessions.find(s => s.id === id),
    create: async () => ({} as Session),
    update: async () => {},
    complete: async () => {},
  };
}

describe('SessionTreeProvider', () => {
  let provider: SessionTreeProvider;
  const hasTerminal = (_id: number) => false;

  beforeEach(() => {
    provider = new SessionTreeProvider(createMockSessionRepo(mockSessions), hasTerminal);
  });

  it('getChildren returns empty array when no active task', async () => {
    const items = await provider.getChildren();
    expect(items).toEqual([]);
  });

  it('getChildren returns sessions filtered to active task', async () => {
    provider.setActiveTask(42);
    const items = await provider.getChildren();
    expect(items).toHaveLength(2);
    expect(items[0].session.name).toBe('impl-1');
    expect(items[1].session.name).toBe('shell-1');
  });

  it('session items have correct kind icons', async () => {
    provider.setActiveTask(42);
    const items = await provider.getChildren();
    expect((items[0].iconPath as any).id).toBe('code');
    expect((items[1].iconPath as any).id).toBe('terminal');
  });

  it('session items have correct status description', async () => {
    provider.setActiveTask(42);
    const items = await provider.getChildren();
    expect(items[0].description).toBe('running');
    expect(items[1].description).toBe('stopped');
  });

  it('refresh fires onDidChangeTreeData', () => {
    let fired = false;
    provider.onDidChangeTreeData(() => { fired = true; });
    provider.refresh();
    expect(fired).toBe(true);
  });

  it('setActiveTask changes the filtered task', async () => {
    provider.setActiveTask(999);
    const items = await provider.getChildren();
    expect(items).toEqual([]);

    provider.setActiveTask(42);
    const items2 = await provider.getChildren();
    expect(items2).toHaveLength(2);
  });
});
