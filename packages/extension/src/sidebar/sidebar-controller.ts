import type { TaskRepository, SessionRepository, Task } from '@tackle/shared';
import { reducer, initialState, type SidebarAction, type SidebarState, type SidebarMode } from './sidebar-state';
import { render } from './render';
import type { InboundMessage } from './messages';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

function renderDescriptions(tasks: Task[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const t of tasks) {
    out[t.id] = md.render(t.description || '');
  }
  return out;
}

/**
 * Best-effort external URL for a task's issue tracker.
 * Repo context is not yet stored on Task; falls back to a search URL when
 * external_id is bare.
 */
function buildExternalUrl(task: Task): string | null {
  const id = task.external_id;
  if (!id) return null;
  if (task.external_system === 'github') {
    // Accept owner/repo#N or owner/repo/issues/N formats if provided.
    const m1 = id.match(/^([^/]+)\/([^#/]+)#(\d+)$/);
    if (m1) return `https://github.com/${m1[1]}/${m1[2]}/issues/${m1[3]}`;
    const m2 = id.match(/^([^/]+)\/([^/]+)\/issues\/(\d+)$/);
    if (m2) return `https://github.com/${m2[1]}/${m2[2]}/issues/${m2[3]}`;
    // Fallback: numeric or unknown — encode bare identifier so the URL still mentions id.
    return `https://github.com/search?q=${encodeURIComponent(id)}&type=issues`;
  }
  if (task.external_system === 'ado') {
    return `https://dev.azure.com/_workitems/edit/${encodeURIComponent(id)}`;
  }
  return null;
}

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

    const [tasks, rawSessions] = await Promise.all([
      this.deps.taskRepo.list(),
      this.deps.sessionRepo ? this.deps.sessionRepo.list() : Promise.resolve([]),
    ]);
    const sessions = rawSessions.filter((s) => !s.deleted_at);
    this.state = {
      ...initialState,
      mode,
      tasks,
      sessions,
      activeTaskId: this.deps.scope.getActiveTaskId(),
      expandedCardIds: new Set(expandedArr),
      closedFolderOpen: closed,
      descriptionsByTaskId: renderDescriptions(tasks),
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
    this.dispatch({ type: 'setDescriptions', descriptionsByTaskId: renderDescriptions(tasks) });
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
        // Entering Detail on a non-Active task should also activate it.
        if (this.state.activeTaskId !== msg.id && this.deps.scope.switchTask) {
          await this.deps.scope.switchTask(msg.id);
        }
        this.dispatch({ type: 'enterDetail', taskId: msg.id });
        await this.deps.workspaceState.update(KEY_MODE, this.state.mode);
        return;
      case 'exitDetail':
        // Back returns to List without deactivating (ADR-0008).
        this.dispatch({ type: 'exitDetail' });
        await this.deps.workspaceState.update(KEY_MODE, this.state.mode);
        return;
      case 'switchDetailTo':
        if (this.deps.scope.switchTask) {
          await this.deps.scope.switchTask(msg.taskId);
        }
        this.dispatch({ type: 'enterDetail', taskId: msg.taskId });
        await this.deps.workspaceState.update(KEY_MODE, this.state.mode);
        return;
      case 'deactivateTask':
        if (exec) await exec('tackle.deactivate');
        return;
      case 'openTaskExternal': {
        const t = this.state.tasks.find((x) => x.id === msg.taskId);
        if (t && exec) {
          const url = buildExternalUrl(t);
          if (url) {
            await exec('vscode.open', url);
          }
        }
        return;
      }
      case 'copyTaskId': {
        const t = this.state.tasks.find((x) => x.id === msg.taskId);
        if (t && exec) {
          await exec('tackle.copyToClipboard', `#${t.external_id}`);
        }
        return;
      }
      case 'toggleExpanded':
        this.dispatch({ type: 'toggleExpanded', taskId: msg.id });
        await this.deps.workspaceState.update(KEY_EXPANDED, Array.from(this.state.expandedCardIds));
        return;
      case 'toggleClosedFolder':
        this.dispatch({ type: 'toggleClosedFolder' });
        await this.deps.workspaceState.update(KEY_CLOSED, this.state.closedFolderOpen);
        return;
      case 'newSession':
        if (exec) {
          const taskId = msg.taskId ?? this.state.activeTaskId;
          await exec('tackle.newSession', taskId !== undefined ? { taskId } : undefined);
        }
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
      case 'markSessionDone':
      case 'restartSession':
      case 'renameSession':
      case 'removeSession':
        if (exec) await exec(`tackle.${msg.type}`, msg.sessionId);
        return;
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
