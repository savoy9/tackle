import * as vscode from 'vscode';
import type { Task, TaskRepository } from '@tackle/shared';

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly task: Task,
    isActive: boolean,
  ) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.description = `#${task.external_id} · ${task.status}`;
    this.contextValue = isActive ? 'tackle.task.active' : 'tackle.task';
    this.command = {
      command: 'tackle.selectTask',
      title: 'Select Task',
      arguments: [task.id],
    };
    if (isActive) {
      this.iconPath = new vscode.ThemeIcon('check');
    }
  }
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private activeTaskId: number | undefined;

  constructor(private taskRepo: TaskRepository) {}

  setRepository(repo: TaskRepository): void {
    this.taskRepo = repo;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setActiveTask(taskId: number | undefined): void {
    this.activeTaskId = taskId;
    this.refresh();
  }

  getActiveTaskId(): number | undefined {
    return this.activeTaskId;
  }

  getTask(id: number): Promise<Task | undefined> {
    return this.taskRepo.get(id);
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TaskTreeItem[]> {
    const tasks = await this.taskRepo.list();
    return tasks.map((t) => new TaskTreeItem(t, t.id === this.activeTaskId));
  }
}
