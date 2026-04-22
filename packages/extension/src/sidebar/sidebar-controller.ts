import type { TaskRepository, SessionRepository } from '@tackle/shared';
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

/** Optional event source on a SessionRepository. The concrete repo may or may
 *  not expose one; when absent the controller falls back to on-demand polling
 *  via refreshSessions(). */
export interface SessionRepoEvents {
  onDidChange?: (listener: () => void) => { dispose(): void };
}

export interface SidebarControllerDeps {
  taskRepo: TaskRepository;
  sessionRepo?: SessionRepository & SessionRepoEvents;
  scope: SidebarScope;
  workspaceState: SidebarWorkspaceState;
  webview?: SidebarWebview;
  /** Executes a VS Code command. Injected for testability. */
  executeCommand?: (command: string, ...args: unknown[]) => Promise<unknown>;
}

const KEY_MODE = 'tackle.sidebar.mode';
const KEY_EXPANDED = 'tackle.sidebar.expandedCardIds';
const KEY_CLOSED = 'tackle.sidebar.closedFolderOpen';

export class SidebarController {
  private state: SidebarState = initialState;
  private webview: SidebarWebview | undefined;
  private scopeSub: { dispose(): void } | undefined;
  private sessionSub: { dispose(): void } | undefined;

  constructor(private deps: SidebarControllerDeps) {
    this.webview = deps.webview;
  }

  async start(): Promise<void> {
    const ws = this.deps.workspaceState;
    const mode = ws.get<SidebarMode>(KEY_MODE) ?? 'list';
    const expandedArr = ws.get<number[]>(KEY_EXPANDED) ?? [];
    const closed = ws.get<boolean>(KEY_CLOSED) ?? false;

    const tasks = await this.deps.taskRepo.list();
    const sessions = this.deps.sessionRepo
      ? (await this.deps.sessionRepo.list()).filter((s) => !s.deleted_at)
      : [];
    this.state = {
      ...initialState,
      mode,
      tasks,
      sessions,
      activeTaskId: this.deps.scope.getActiveTaskId(),
      expandedCardIds: new Set(expandedArr),
      closedFolderOpen: closed,
    };

    this.scopeSub = this.deps.scope.onDidChangeActiveTask((id) => {
      this.dispatch({ type: 'setActiveTask', taskId: id });
    });

    if (this.deps.sessionRepo?.onDidChange) {
      this.sessionSub = this.deps.sessionRepo.onDidChange(() => {
        void this.refreshSessions();
      });
    }

    this.pushRender();
  }

  dispose(): void {
    this.scopeSub?.dispose();
    this.sessionSub?.dispose();
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
    await this.refreshSessions();
  }

  async refreshSessions(): Promise<void> {
    if (!this.deps.sessionRepo) return;
    const all = await this.deps.sessionRepo.list();
    const sessions = all.filter((s) => !s.deleted_at);
    this.dispatch({ type: 'setSessions', sessions });
  }

  async handleMessage(msg: InboundMessage): Promise<void> {
    const exec = this.deps.executeCommand;
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
      case 'newSession':
        if (exec) await exec('tackle.newSession');
        return;
      case 'focusSession':
        if (exec) {
          await exec('tackle.focusSession', msg.sessionId);
          // Ensure parent task becomes Active.
          const sess = this.state.sessions.find((s) => s.id === msg.sessionId);
          if (sess?.task_id != null && this.deps.scope.switchTask) {
            await this.deps.scope.switchTask(sess.task_id);
          }
        }
        return;
      case 'stopSession':
        if (exec) await exec('tackle.stopSession', msg.sessionId);
        return;
      case 'markSessionDone':
        if (exec) await exec('tackle.markSessionDone', msg.sessionId);
        return;
      case 'restartSession':
        if (exec) await exec('tackle.restartSession', msg.sessionId);
        return;
      case 'renameSession':
        if (exec) await exec('tackle.renameSession', msg.sessionId);
        return;
      case 'removeSession':
        if (exec) await exec('tackle.removeSession', msg.sessionId);
        return;
      case 'openTaskExternal':
      case 'copyTaskId':
      case 'taskOverflow':
      case 'sessionOverflow':
        // Stubs: logged only in this slice; future slices may wire menus.
        console.log('tackle sidebar: stub action', msg);
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
