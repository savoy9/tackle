import type { TerminalOrchestrator } from '../terminal';
import type { LayoutManager } from '../layout';

export interface ScopeWorkspaceState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface ScopeManagerDeps {
  terminalOrchestrator: TerminalOrchestrator;
  layoutManager: LayoutManager;
  workspaceState?: ScopeWorkspaceState;
}

const KEY_ACTIVE_TASK = 'tackle.activeTaskId';

export class ScopeManager {
  private activeTaskId: number | undefined;
  private listeners: Array<(id: number | undefined) => void> = [];

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

    if (this.deps.workspaceState) {
      await this.deps.workspaceState.update(KEY_ACTIVE_TASK, newTaskId);
    }
    this.emit(newTaskId);
  }

  restoreActiveTask(): void {
    const stored = this.deps.workspaceState?.get<number>(KEY_ACTIVE_TASK);
    if (stored !== undefined) {
      this.activeTaskId = stored;
      this.emit(stored);
    }
  }

  getActiveTaskId(): number | undefined {
    return this.activeTaskId;
  }

  onDidChangeActiveTask(listener: (id: number | undefined) => void): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  }

  private emit(id: number | undefined): void {
    for (const l of this.listeners) l(id);
  }
}
