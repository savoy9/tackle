import * as vscode from 'vscode';
import type { Session, SessionRepository, SessionKind } from '@tackle/shared';

const KIND_ICONS: Record<SessionKind, string> = {
  plan: 'notebook',
  implement: 'code',
  review: 'eye',
  debug: 'debug',
  test: 'beaker',
  pilot: 'rocket',
  shell: 'terminal',
};

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: Session, hasTerminal: boolean) {
    super(session.tab_label || session.name, vscode.TreeItemCollapsibleState.None);
    this.description = session.status;
    this.iconPath = new vscode.ThemeIcon(KIND_ICONS[session.kind]);
    this.contextValue = hasTerminal ? 'tackle.session.attached' : `tackle.session.${session.status}`;
    this.command = {
      command: 'tackle.focusSession',
      title: 'Focus Session',
      arguments: [session.id],
    };
  }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private activeTaskId: number | undefined;

  constructor(
    private sessionRepo: SessionRepository,
    private hasTerminalFn: (sessionId: number) => boolean,
  ) {}

  setRepository(repo: SessionRepository): void {
    this.sessionRepo = repo;
    this.refresh();
  }

  setHasTerminalFn(fn: (sessionId: number) => boolean): void {
    this.hasTerminalFn = fn;
  }

  refresh(): void { this._onDidChangeTreeData.fire(undefined); }

  setActiveTask(taskId: number | undefined): void {
    this.activeTaskId = taskId;
    this.refresh();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem { return element; }

  async getChildren(): Promise<SessionTreeItem[]> {
    if (!this.activeTaskId) return [];
    const sessions = await this.sessionRepo.listForTask(this.activeTaskId);
    return sessions.map(s => new SessionTreeItem(s, this.hasTerminalFn(s.id)));
  }
}
