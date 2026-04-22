import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, TaskRepository } from '@tackle/shared';
import { SidebarController } from '../sidebar/sidebar-controller';

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

function makeRepo(tasks: Task[]): TaskRepository {
  return {
    list: async () => tasks,
    get: async (id: number) => tasks.find((t) => t.id === id),
    upsert: async () => {},
    upsertBatch: async () => {},
  };
}

function makeScope(initialId?: number) {
  const listeners: Array<(id: number | undefined) => void> = [];
  let activeTaskId = initialId;
  return {
    listeners,
    getActiveTaskId: () => activeTaskId,
    onDidChangeActiveTask: (fn: (id: number | undefined) => void) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    fire(id: number | undefined) {
      activeTaskId = id;
      for (const l of listeners) l(id);
    },
  };
}

function makeWorkspaceState() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
}

describe('SidebarController', () => {
  let poster: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    poster = { postMessage: vi.fn() };
  });

  it('initial start() loads tasks and pushes a render message', async () => {
    const repo = makeRepo([task(1, 'A'), task(2, 'B')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();

    expect(poster.postMessage).toHaveBeenCalled();
    const msg = poster.postMessage.mock.calls[0][0];
    expect(msg.type).toBe('render');
    expect(msg.html).toContain('A');
    expect(msg.html).toContain('B');
  });

  it('restores persisted mode, expandedCardIds, closedFolderOpen from workspaceState', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    ws.store.set('tackle.sidebar.mode', { kind: 'detail', taskId: 1 });
    ws.store.set('tackle.sidebar.expandedCardIds', [1, 2, 3]);
    ws.store.set('tackle.sidebar.closedFolderOpen', true);

    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();

    const state = c.getState();
    expect(state.mode).toEqual({ kind: 'detail', taskId: 1 });
    expect(Array.from(state.expandedCardIds)).toEqual([1, 2, 3]);
    expect(state.closedFolderOpen).toBe(true);
  });

  it('handles enterDetail inbound message and persists mode', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();

    await c.handleMessage({ type: 'enterDetail', id: 1 });

    expect(c.getState().mode).toEqual({ kind: 'detail', taskId: 1 });
    expect(ws.store.get('tackle.sidebar.mode')).toEqual({ kind: 'detail', taskId: 1 });
  });

  it('handles exitDetail and persists', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    await c.handleMessage({ type: 'enterDetail', id: 1 });
    await c.handleMessage({ type: 'exitDetail' });
    expect(c.getState().mode).toBe('list');
    expect(ws.store.get('tackle.sidebar.mode')).toBe('list');
  });

  it('handles activateTask by delegating to scope.switchTask', async () => {
    const repo = makeRepo([task(1, 'A'), task(2, 'B')]);
    const scope = { ...makeScope(), switchTask: vi.fn(async () => {}) };
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    await c.handleMessage({ type: 'activateTask', id: 2 });
    expect(scope.switchTask).toHaveBeenCalledWith(2);
  });

  it('handles toggleExpanded and persists as number[]', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    await c.handleMessage({ type: 'toggleExpanded', id: 1 });
    await c.handleMessage({ type: 'toggleExpanded', id: 2 });
    expect(ws.store.get('tackle.sidebar.expandedCardIds')).toEqual([1, 2]);
  });

  it('handles toggleClosedFolder and persists', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    await c.handleMessage({ type: 'toggleClosedFolder' });
    expect(ws.store.get('tackle.sidebar.closedFolderOpen')).toBe(true);
  });

  it('subscribes to scope.onDidChangeActiveTask and re-renders on change', async () => {
    const repo = makeRepo([task(1, 'A'), task(2, 'B')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    const before = poster.postMessage.mock.calls.length;
    scope.fire(2);
    // Allow any microtasks to flush
    await Promise.resolve();
    expect(c.getState().activeTaskId).toBe(2);
    expect(poster.postMessage.mock.calls.length).toBeGreaterThan(before);
  });

  it('refresh() re-reads tasks from the repo', async () => {
    const tasks: Task[] = [task(1, 'A')];
    const repo: TaskRepository = {
      list: async () => tasks.slice(),
      get: async (id) => tasks.find((t) => t.id === id),
      upsert: async () => {},
      upsertBatch: async () => {},
    };
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    tasks.push(task(2, 'B'));
    await c.refresh();
    expect(c.getState().tasks.map((t) => t.id)).toEqual([1, 2]);
  });

  it('setWebview swaps poster and immediately renders to the new one', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({ taskRepo: repo, scope: scope as any, workspaceState: ws, webview: poster });
    await c.start();
    const newPoster = { postMessage: vi.fn() };
    c.setWebview(newPoster);
    expect(newPoster.postMessage).toHaveBeenCalled();
  });
});
