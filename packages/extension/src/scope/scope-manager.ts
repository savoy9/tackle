import type { TerminalOrchestrator } from '../terminal';
import type { TaskTreeProvider } from '../task';
import type { LayoutManager } from '../layout';

export interface ScopeManagerDeps {
  terminalOrchestrator: TerminalOrchestrator;
  taskTreeProvider: TaskTreeProvider;
  sessionTreeProvider?: { setActiveTask(id: number | undefined): void; refresh(): void };
  layoutManager: LayoutManager;
}

export class ScopeManager {
  private activeTaskId: number | undefined;

  constructor(private deps: ScopeManagerDeps) {}

  async switchTask(newTaskId: number): Promise<void> {
    const prevTaskId = this.activeTaskId;

    const saving = prevTaskId !== undefined
      ? this.deps.layoutManager.saveLayoutState(String(prevTaskId), [])
      : undefined;

    this.deps.terminalOrchestrator.disposeAll();
    await saving;

    await this.deps.layoutManager.restoreLayoutState(String(newTaskId));
    await this.deps.terminalOrchestrator.reattachForTask(newTaskId);

    this.activeTaskId = newTaskId;
    this.deps.taskTreeProvider.setActiveTask(newTaskId);
    this.deps.sessionTreeProvider?.setActiveTask(newTaskId);
  }

  getActiveTaskId(): number | undefined {
    return this.activeTaskId;
  }
}
