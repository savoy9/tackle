import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LayoutManager } from '../layout/layout-manager';
import { executeCommandCalls, resetMocks } from './vscode-mock';
import type { LayoutState } from '@tackle/shared';

vi.mock('vscode', () => import('./vscode-mock').then(m => m.default));

describe('LayoutManager', () => {
  const store = new Map<string, LayoutState>();
  const mockLayoutRepo = {
    get: vi.fn(async (taskId: string) => store.get(taskId)),
    save: vi.fn(async (state: LayoutState) => { store.set(state.task_id, state); }),
  };

  let layoutManager: LayoutManager;

  beforeEach(() => {
    store.clear();
    resetMocks();
    layoutManager = new LayoutManager(mockLayoutRepo);
  });

  it('saveLayoutState persists to repository', async () => {
    await layoutManager.saveLayoutState('task-1', [{ session_id: 1, group_index: 0 }]);
    expect(mockLayoutRepo.save).toHaveBeenCalled();
    const saved = store.get('task-1');
    expect(saved).toBeDefined();
    expect(saved!.task_id).toBe('task-1');
    expect(saved!.terminal_placements).toEqual([{ session_id: 1, group_index: 0 }]);
  });

  it('restoreLayoutState calls setEditorLayout with saved layout', async () => {
    await layoutManager.saveLayoutState('task-2', []);
    await layoutManager.restoreLayoutState('task-2');

    expect(executeCommandCalls[0][0]).toBe('vscode.setEditorLayout');
    expect(executeCommandCalls[0][1]).toEqual({
      orientation: 0,
      groups: [{ size: 0.65 }, { size: 0.35 }],
    });
  });

  it('restoreLayoutState returns undefined for unknown task', async () => {
    const result = await layoutManager.restoreLayoutState('nonexistent');
    expect(result).toBeUndefined();
  });

  it('layout state round-trips through save/restore', async () => {
    await layoutManager.saveLayoutState('task-3', [{ session_id: 5, group_index: 1 }]);
    const restored = await layoutManager.restoreLayoutState('task-3');

    expect(restored).toBeDefined();
    expect(restored!.task_id).toBe('task-3');
    expect(restored!.terminal_placements).toEqual([{ session_id: 5, group_index: 1 }]);
  });
});
