import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task, TaskRepository } from '@tackle/shared';
import { TaskTreeProvider } from '../task/task-tree-provider';

const makeMockTask = (id: number, title: string, externalId: string): Task => ({
  id,
  external_id: externalId,
  external_system: 'github',
  title,
  description: '',
  status: 'open',
  assignee: null,
  synced_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
});

function createMockRepo(tasks: Task[]): TaskRepository {
  return {
    list: async () => tasks,
    get: async (id: number) => tasks.find((t) => t.id === id),
    upsert: async () => {},
    upsertBatch: async () => {},
  };
}

describe('TaskTreeProvider', () => {
  let provider: TaskTreeProvider;
  let tasks: Task[];

  beforeEach(() => {
    tasks = [
      makeMockTask(1, 'Fix bug', '10'),
      makeMockTask(2, 'Add feature', '20'),
    ];
    provider = new TaskTreeProvider(createMockRepo(tasks));
  });

  it('getChildren returns TaskTreeItems for all tasks', async () => {
    const items = await provider.getChildren();
    expect(items).toHaveLength(2);
    expect(items[0].task.title).toBe('Fix bug');
    expect(items[0].description).toBe('#10 · open');
    expect(items[1].task.title).toBe('Add feature');
  });

  it('setActiveTask marks the correct item', async () => {
    provider.setActiveTask(2);
    const items = await provider.getChildren();
    expect(items[0].contextValue).toBe('tackle.task');
    expect(items[1].contextValue).toBe('tackle.task.active');
    expect(items[1].iconPath).toBeDefined();
  });

  it('getActiveTaskId returns current active task', () => {
    expect(provider.getActiveTaskId()).toBeUndefined();
    provider.setActiveTask(1);
    expect(provider.getActiveTaskId()).toBe(1);
  });

  it('refresh fires onDidChangeTreeData', () => {
    let fired = false;
    provider.onDidChangeTreeData(() => {
      fired = true;
    });
    provider.refresh();
    expect(fired).toBe(true);
  });
});
