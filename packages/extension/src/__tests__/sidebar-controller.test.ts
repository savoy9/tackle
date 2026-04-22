import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, TaskRepository, Session, SessionRepository } from '@tackle/shared';
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

// ── #29 additions ──

const sessionRow = (id: number, task_id: number, over: Partial<Session> = {}): Session => ({
  id,
  task_id,
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

function makeSessionRepo(sessions: Session[]) {
  const listeners: Array<() => void> = [];
  const repo: SessionRepository & { onDidChange: (fn: () => void) => { dispose(): void }; fire: () => void } = {
    list: async () => sessions.slice(),
    get: async (id) => sessions.find((s) => s.id === id),
    listForTask: async (tid) => sessions.filter((s) => s.task_id === tid),
    create: async () => ({} as any),
    update: async () => {},
    complete: async () => {},
    softDelete: async () => {},
    onDidChange: (fn) => {
      listeners.push(fn);
      return { dispose: () => {} };
    },
    fire: () => { for (const l of listeners) l(); },
  };
  return repo;
}

describe('SidebarController — sessions (#29)', () => {
  it('start() loads sessions from sessionRepo into state', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const sessionRepo = makeSessionRepo([sessionRow(10, 1), sessionRow(11, 1)]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const poster = { postMessage: vi.fn() };
    const c = new SidebarController({
      taskRepo: repo,
      sessionRepo,
      scope: scope as any,
      workspaceState: ws,
      webview: poster,
    });
    await c.start();
    expect(c.getState().sessions.map((s) => s.id)).toEqual([10, 11]);
  });

  it('start() excludes soft-deleted sessions', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const sessionRepo = makeSessionRepo([
      sessionRow(10, 1),
      sessionRow(11, 1, { deleted_at: '2026-01-01' }),
    ]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({
      taskRepo: repo,
      sessionRepo,
      scope: scope as any,
      workspaceState: ws,
      webview: { postMessage: vi.fn() },
    });
    await c.start();
    expect(c.getState().sessions.map((s) => s.id)).toEqual([10]);
  });

  it('subscribes to sessionRepo.onDidChange and refreshes on change', async () => {
    const repo = makeRepo([task(1, 'A')]);
    const sessions: Session[] = [sessionRow(10, 1)];
    const sessionRepo = makeSessionRepo(sessions);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({
      taskRepo: repo,
      sessionRepo,
      scope: scope as any,
      workspaceState: ws,
      webview: { postMessage: vi.fn() },
    });
    await c.start();
    sessions.push(sessionRow(11, 1));
    (sessionRepo as any).fire();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.getState().sessions.map((s) => s.id)).toEqual([10, 11]);
  });

  it('handleMessage stopSession dispatches executeCommand', async () => {
    const exec = vi.fn(async () => undefined);
    const repo = makeRepo([task(1, 'A')]);
    const sessionRepo = makeSessionRepo([sessionRow(10, 1)]);
    const scope = makeScope();
    const ws = makeWorkspaceState();
    const c = new SidebarController({
      taskRepo: repo, sessionRepo, scope: scope as any, workspaceState: ws,
      webview: { postMessage: vi.fn() }, executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'stopSession', sessionId: 10 });
    expect(exec).toHaveBeenCalledWith('tackle.stopSession', 10);
  });

  it('handleMessage markSessionDone dispatches executeCommand', async () => {
    const exec = vi.fn(async () => undefined);
    const repo = makeRepo([task(1, 'A')]);
    const sessionRepo = makeSessionRepo([sessionRow(10, 1)]);
    const c = new SidebarController({
      taskRepo: repo, sessionRepo, scope: makeScope() as any,
      workspaceState: makeWorkspaceState(),
      webview: { postMessage: vi.fn() }, executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'markSessionDone', sessionId: 10 });
    expect(exec).toHaveBeenCalledWith('tackle.markSessionDone', 10);
  });

  it('handleMessage newSession triggers tackle.newSession command', async () => {
    const exec = vi.fn(async () => undefined);
    const c = new SidebarController({
      taskRepo: makeRepo([task(1, 'A')]),
      scope: makeScope() as any,
      workspaceState: makeWorkspaceState(),
      webview: { postMessage: vi.fn() },
      executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'newSession', taskId: 1 });
    expect(exec).toHaveBeenCalledWith('tackle.newSession');
  });

  it('handleMessage focusSession calls tackle.focusSession and activates parent', async () => {
    const exec = vi.fn(async () => undefined);
    const switchTask = vi.fn(async () => {});
    const scope = { ...makeScope(), switchTask };
    const repo = makeRepo([task(1, 'A'), task(2, 'B')]);
    const sessionRepo = makeSessionRepo([sessionRow(10, 2)]);
    const c = new SidebarController({
      taskRepo: repo, sessionRepo, scope: scope as any,
      workspaceState: makeWorkspaceState(),
      webview: { postMessage: vi.fn() }, executeCommand: exec,
    });
    await c.start();
    await c.handleMessage({ type: 'focusSession', sessionId: 10 });
    expect(exec).toHaveBeenCalledWith('tackle.focusSession', 10);
    expect(switchTask).toHaveBeenCalledWith(2);
  });

});
