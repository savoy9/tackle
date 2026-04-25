import { describe, it, expect, vi } from 'vitest';
import type { Task, TaskRepository } from '@tackle/shared';
import { SidebarController } from '../sidebar/sidebar-controller';

const mkTask = (id: number, title: string, over: Partial<Task> = {}): Task => ({
  id,
  external_id: String(id),
  external_system: 'github',
  title,
  description: '',
  external_status: 'open',
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

function makeRepo(tasks: Task[]): TaskRepository {
  return {
    list: async () => tasks,
    get: async (id: number) => tasks.find((t) => t.id === id),
    upsert: async () => {},
    upsertBatch: async () => {},
    setWorktree: async () => {},
  };
}

function makeScope() {
  return {
    getActiveTaskId: () => undefined,
    onDidChangeActiveTask: () => ({ dispose: () => {} }),
  };
}

function makeWs() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: <T>(key: string) => store.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
}

describe('SidebarController — #31 detail', () => {
  it('start() precomputes description HTML for each task', async () => {
    const repo = makeRepo([
      mkTask(1, 'A', { description: 'Hello **world**' }),
      mkTask(2, 'B', { description: '' }),
    ]);
    const c = new SidebarController({
      taskRepo: repo,
      scope: makeScope() as any,
      workspaceState: makeWs(),
      webview: { postMessage: vi.fn() },
    });
    await c.start();
    const state = c.getState();
    expect(state.descriptionsByTaskId[1]).toContain('<strong>world</strong>');
    expect(state.descriptionsByTaskId[2]).toBeDefined();
  });

  it('refresh() re-renders descriptions when tasks change', async () => {
    const tasks: Task[] = [mkTask(1, 'A', { description: 'Old' })];
    const repo: TaskRepository = {
      list: async () => tasks.slice(),
      get: async (id) => tasks.find((t) => t.id === id),
      upsert: async () => {},
      upsertBatch: async () => {},
      setWorktree: async () => {},
    };
    const c = new SidebarController({
      taskRepo: repo,
      scope: makeScope() as any,
      workspaceState: makeWs(),
      webview: { postMessage: vi.fn() },
    });
    await c.start();
    tasks[0] = mkTask(1, 'A', { description: 'New **text**' });
    await c.refresh();
    expect(c.getState().descriptionsByTaskId[1]).toContain('<strong>text</strong>');
  });

  it('handles switchDetailTo: activates task AND enters detail', async () => {
    const switchTask = vi.fn(async () => {});
    const scope = {
      getActiveTaskId: () => 1,
      onDidChangeActiveTask: () => ({ dispose: () => {} }),
      switchTask,
    };
    const ws = makeWs();
    const c = new SidebarController({
      taskRepo: makeRepo([mkTask(1, 'A'), mkTask(2, 'B')]),
      scope: scope as any,
      workspaceState: ws,
      webview: { postMessage: vi.fn() },
    });
    await c.start();
    await c.handleMessage({ type: 'switchDetailTo', taskId: 2 });
    expect(switchTask).toHaveBeenCalledWith(2);
    expect(c.getState().mode).toEqual({ kind: 'detail', taskId: 2 });
    expect(ws.store.get('tackle.sidebar.mode')).toEqual({ kind: 'detail', taskId: 2 });
  });

  it('handles openTaskExternal by composing a GitHub URL and invoking vscode.open', async () => {
    const exec = vi.fn(async () => undefined);
    const c = new SidebarController({
      taskRepo: makeRepo([mkTask(1, 'A', { external_system: 'github', external_id: '42' })]),
      scope: makeScope() as any,
      workspaceState: makeWs(),
      webview: { postMessage: vi.fn() },
      executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'openTaskExternal', taskId: 1 });
    // Accept either vscode.open or env.openExternal semantics; must mention the #id.
    expect(exec).toHaveBeenCalled();
    const args = exec.mock.calls.flat();
    const joined = JSON.stringify(args);
    expect(joined).toMatch(/42/);
  });

  it('handles copyTaskId by copying #<external_id> to clipboard', async () => {
    const exec = vi.fn(async () => undefined);
    const c = new SidebarController({
      taskRepo: makeRepo([mkTask(1, 'A', { external_id: '42' })]),
      scope: makeScope() as any,
      workspaceState: makeWs(),
      webview: { postMessage: vi.fn() },
      executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'copyTaskId', taskId: 1 });
    // Expect dispatched to a clipboard/copy command with '#42' in args.
    expect(exec).toHaveBeenCalled();
    const joined = JSON.stringify(exec.mock.calls.flat());
    expect(joined).toContain('#42');
  });
});
