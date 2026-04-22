import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopeManager } from '../scope/scope-manager';

describe('ScopeManager', () => {
  const mockTerminalOrchestrator = {
    disposeAll: vi.fn(),
    reattachForTask: vi.fn(async () => {}),
    focusTerminal: vi.fn(),
  };

  const mockLayoutManager = {
    saveLayoutState: vi.fn(async () => {}),
    restoreLayoutState: vi.fn(async () => undefined),
  };

  function makeWorkspaceState() {
    const store = new Map<string, unknown>();
    return {
      store,
      get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };
  }

  let scopeManager: ScopeManager;
  let workspaceState: ReturnType<typeof makeWorkspaceState>;

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceState = makeWorkspaceState();
    scopeManager = new ScopeManager({
      terminalOrchestrator: mockTerminalOrchestrator as any,
      layoutManager: mockLayoutManager as any,
      workspaceState: workspaceState as any,
    });
  });

  it('switchTask saves current layout before disposing terminals', async () => {
    await scopeManager.switchTask(1);
    vi.clearAllMocks();
    await scopeManager.switchTask(2);

    const saveOrder = mockLayoutManager.saveLayoutState.mock.invocationCallOrder[0];
    const disposeOrder = mockTerminalOrchestrator.disposeAll.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(disposeOrder);
  });

  it('switchTask disposes terminals before restoring new layout', async () => {
    await scopeManager.switchTask(1);
    const disposeOrder = mockTerminalOrchestrator.disposeAll.mock.invocationCallOrder[0];
    const restoreOrder = mockLayoutManager.restoreLayoutState.mock.invocationCallOrder[0];
    expect(disposeOrder).toBeLessThan(restoreOrder);
  });

  it('switchTask restores layout before reattaching terminals', async () => {
    await scopeManager.switchTask(1);
    const restoreOrder = mockLayoutManager.restoreLayoutState.mock.invocationCallOrder[0];
    const reattachOrder = mockTerminalOrchestrator.reattachForTask.mock.invocationCallOrder[0];
    expect(restoreOrder).toBeLessThan(reattachOrder);
  });

  it('switchTask reattaches terminals for new task', async () => {
    await scopeManager.switchTask(42);
    expect(mockTerminalOrchestrator.reattachForTask).toHaveBeenCalledWith(42);
  });

  it('switchTask works for first task (no previous layout to save)', async () => {
    await scopeManager.switchTask(1);
    expect(mockLayoutManager.saveLayoutState).not.toHaveBeenCalled();
    expect(mockTerminalOrchestrator.disposeAll).toHaveBeenCalled();
    expect(mockLayoutManager.restoreLayoutState).toHaveBeenCalledWith('1');
  });

  it('getActiveTaskId returns current task', async () => {
    expect(scopeManager.getActiveTaskId()).toBeUndefined();
    await scopeManager.switchTask(7);
    expect(scopeManager.getActiveTaskId()).toBe(7);
  });

  it('switchTask persists activeTaskId to workspaceState', async () => {
    await scopeManager.switchTask(9);
    expect(workspaceState.store.get('tackle.activeTaskId')).toBe(9);
  });

  it('restoreActiveTask() reads persisted id without side-effects on terminals', async () => {
    workspaceState.store.set('tackle.activeTaskId', 11);
    scopeManager.restoreActiveTask();
    expect(scopeManager.getActiveTaskId()).toBe(11);
    expect(mockTerminalOrchestrator.reattachForTask).not.toHaveBeenCalled();
  });

  it('onDidChangeActiveTask fires when switchTask runs', async () => {
    const fn = vi.fn();
    scopeManager.onDidChangeActiveTask(fn);
    await scopeManager.switchTask(3);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('onDidChangeActiveTask fires when restoreActiveTask is called with a stored id', () => {
    workspaceState.store.set('tackle.activeTaskId', 15);
    const fn = vi.fn();
    scopeManager.onDidChangeActiveTask(fn);
    scopeManager.restoreActiveTask();
    expect(fn).toHaveBeenCalledWith(15);
  });
});
