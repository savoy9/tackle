import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopeManager } from '../scope/scope-manager';

describe('ScopeManager', () => {
  const mockTerminalOrchestrator = {
    disposeAll: vi.fn(),
    reattachForTask: vi.fn(async () => {}),
    focusTerminal: vi.fn(),
  };

  const mockTaskTreeProvider = {
    setActiveTask: vi.fn(),
    refresh: vi.fn(),
  };

  const mockSessionTreeProvider = {
    setActiveTask: vi.fn(),
    refresh: vi.fn(),
  };

  const mockLayoutManager = {
    saveLayoutState: vi.fn(async () => {}),
    restoreLayoutState: vi.fn(async () => undefined),
  };

  let scopeManager: ScopeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    scopeManager = new ScopeManager({
      terminalOrchestrator: mockTerminalOrchestrator as any,
      taskTreeProvider: mockTaskTreeProvider as any,
      sessionTreeProvider: mockSessionTreeProvider,
      layoutManager: mockLayoutManager as any,
    });
  });

  it('switchTask saves current layout before disposing terminals', async () => {
    // Set an active task first
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

  it('switchTask updates TreeViews with new task ID', async () => {
    await scopeManager.switchTask(5);
    expect(mockTaskTreeProvider.setActiveTask).toHaveBeenCalledWith(5);
    expect(mockSessionTreeProvider.setActiveTask).toHaveBeenCalledWith(5);
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
});
