import type { TaskRepository } from '@tackle/shared';
import { reducer, initialState, type SidebarAction, type SidebarState, type SidebarMode } from './sidebar-state';
import { render } from './render';
import type { InboundMessage } from './messages';

export interface SidebarScope {
  getActiveTaskId(): number | undefined;
  onDidChangeActiveTask(listener: (id: number | undefined) => void): { dispose(): void };
  switchTask?(taskId: number): Promise<void>;
}

export interface SidebarWebview {
  postMessage(msg: unknown): void;
}

export interface SidebarWorkspaceState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface SidebarControllerDeps {
  taskRepo: TaskRepository;
  scope: SidebarScope;
  workspaceState: SidebarWorkspaceState;
  webview?: SidebarWebview;
}

const KEY_MODE = 'tackle.sidebar.mode';
const KEY_EXPANDED = 'tackle.sidebar.expandedCardIds';
const KEY_CLOSED = 'tackle.sidebar.closedFolderOpen';

export class SidebarController {
  private state: SidebarState = initialState;
  private webview: SidebarWebview | undefined;
  private scopeSub: { dispose(): void } | undefined;

  constructor(private deps: SidebarControllerDeps) {
    this.webview = deps.webview;
  }

  async start(): Promise<void> {
    const ws = this.deps.workspaceState;
    const mode = ws.get<SidebarMode>(KEY_MODE) ?? 'list';
    const expandedArr = ws.get<number[]>(KEY_EXPANDED) ?? [];
    const closed = ws.get<boolean>(KEY_CLOSED) ?? false;

    const tasks = await this.deps.taskRepo.list();
    this.state = {
      ...initialState,
      mode,
      tasks,
      activeTaskId: this.deps.scope.getActiveTaskId(),
      expandedCardIds: new Set(expandedArr),
      closedFolderOpen: closed,
    };

    this.scopeSub = this.deps.scope.onDidChangeActiveTask((id) => {
      this.dispatch({ type: 'setActiveTask', taskId: id });
    });

    this.pushRender();
  }

  dispose(): void {
    this.scopeSub?.dispose();
  }

  getState(): SidebarState {
    return this.state;
  }

  setWebview(webview: SidebarWebview | undefined): void {
    this.webview = webview;
    this.pushRender();
  }

  async refresh(): Promise<void> {
    const tasks = await this.deps.taskRepo.list();
    this.dispatch({ type: 'setTasks', tasks });
  }

  async handleMessage(msg: InboundMessage): Promise<void> {
    switch (msg.type) {
      case 'activateTask':
        if (this.deps.scope.switchTask) {
          await this.deps.scope.switchTask(msg.id);
        }
        return;
      case 'enterDetail':
        this.dispatch({ type: 'enterDetail', taskId: msg.id });
        await this.deps.workspaceState.update(KEY_MODE, this.state.mode);
        return;
      case 'exitDetail':
        this.dispatch({ type: 'exitDetail' });
        await this.deps.workspaceState.update(KEY_MODE, this.state.mode);
        return;
      case 'toggleExpanded':
        this.dispatch({ type: 'toggleExpanded', taskId: msg.id });
        await this.deps.workspaceState.update(KEY_EXPANDED, Array.from(this.state.expandedCardIds));
        return;
      case 'toggleClosedFolder':
        this.dispatch({ type: 'toggleClosedFolder' });
        await this.deps.workspaceState.update(KEY_CLOSED, this.state.closedFolderOpen);
        return;
    }
  }

  private dispatch(action: SidebarAction): void {
    const next = reducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    this.pushRender();
  }

  private pushRender(): void {
    if (!this.webview) return;
    this.webview.postMessage({ type: 'render', html: render(this.state) });
  }
}
