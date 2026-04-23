import * as vscode from 'vscode';
import { PsmuxBridge } from '@tackle/shared';
import type { SessionRepository, Session, SessionKind } from '@tackle/shared';
import type { AgentRegistry } from '../agent/agent-registry';

/**
 * Pure helper: resolve cwd for a session, preferring its worktree_path
 * over the task's worktree_path over the workspace root. Exported for
 * standalone testing.
 */
export function resolveCwd(
  session: Pick<Session, 'worktree_path'>,
  workspaceRoot: string,
  task?: { worktree_path: string | null } | null,
): string {
  return session.worktree_path ?? task?.worktree_path ?? workspaceRoot;
}

export interface SessionWorktreeProvider {
  /**
   * Returns the worktree path/branch/baseBranch for `taskId`. Called lazily
   * before the first Session spawn on a Task; subsequent spawns hit it again
   * and the implementation is expected to be idempotent (returns the same
   * result without duplicating disk state).
   */
  ensureForTask(taskId: number): Promise<{ path: string; branch: string; baseBranch: string }>;
}

export class TerminalOrchestrator {
  private terminalMap = new Map<number, vscode.Terminal>();
  private reverseMap = new WeakMap<vscode.Terminal, number>();
  private disposingTerminals = new WeakSet<vscode.Terminal>();

  constructor(
    private sessionRepo: SessionRepository,
    private psmux: PsmuxBridge,
    private agentRegistry: AgentRegistry,
    private worktreeProvider?: SessionWorktreeProvider,
  ) {}

  async createTerminal(opts: {
    taskId: number;
    taskSlug: string;
    kind: SessionKind;
    source?: string;
    label?: string;
    /** Explicit tab_label override; bypasses generated psmux tab label. */
    tabLabel?: string;
    agent?: string | null;
    worktreePath?: string | null;
  }): Promise<Session> {
    const source = opts.source ?? 'gh';

    const existing = await this.sessionRepo.listForTask(opts.taskId);
    const n = existing.filter(s => s.kind === opts.kind).length + 1;

    const psmuxName = PsmuxBridge.generateSessionName(source, String(opts.taskId), opts.kind, n);
    const tabLabel = opts.tabLabel
      ?? PsmuxBridge.generateTabLabel(String(opts.taskId), opts.taskSlug, opts.kind, n, opts.label);

    this.psmux.createSession(psmuxName);

    const adapter = this.agentRegistry.resolve(opts.agent);

    // Resolve effective worktree_path for this Session. If the caller passed
    // an explicit override (α-isolation path), honor it; otherwise — for any
    // kind that launches an Agent — ask the worktree provider to ensure the
    // Task's worktree exists and use its path. Shell kind never triggers
    // provisioning (no Agent → spawn in workspaceRoot).
    let effectiveWorktreePath: string | null = opts.worktreePath ?? null;
    if (
      effectiveWorktreePath === null
      && this.agentRegistry.shouldLaunch(opts.kind)
      && this.worktreeProvider
    ) {
      const wt = await this.worktreeProvider.ensureForTask(opts.taskId);
      effectiveWorktreePath = wt.path;
    }

    const terminal = vscode.window.createTerminal({
      name: tabLabel,
      location: vscode.TerminalLocation.Editor,
      shellPath: this.psmux.binary,
      shellArgs: ['attach', '-t', psmuxName],
    });

    const session = await this.sessionRepo.create({
      task_id: opts.taskId,
      phase_id: null,
      name: tabLabel,
      kind: opts.kind,
      psmux_name: psmuxName,
      tab_label: tabLabel,
      sort_order: n,
      agent: adapter.name,
      worktree_path: effectiveWorktreePath,
    });

    if (this.agentRegistry.shouldLaunch(opts.kind)) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      const cwd = resolveCwd(session, workspaceRoot);
      this.psmux.sendKeys(psmuxName, `cd ${cwd} && ${adapter.command}`);
    }

    this.trackTerminal(session.id, terminal);
    return session;
  }

  disposeAll(): void {
    for (const terminal of this.terminalMap.values()) {
      this.disposingTerminals.add(terminal);
      terminal.dispose();
    }
    this.terminalMap.clear();
  }

  async reattachForTask(taskId: number): Promise<void> {
    const sessions = await this.sessionRepo.listForTask(taskId);
    for (const session of sessions.filter(s => s.status === 'running')) {
      this.attachSession(session);
    }
  }

  async reattachSession(sessionId: number): Promise<void> {
    const session = await this.sessionRepo.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'running') {
      await this.sessionRepo.update(sessionId, { status: 'running', ended_at: null });
    }
    this.attachSession({ ...session, status: 'running' });
  }

  private attachSession(session: Session): void {
    const terminal = vscode.window.createTerminal({
      name: session.tab_label,
      location: vscode.TerminalLocation.Editor,
      shellPath: this.psmux.binary,
      shellArgs: ['attach', '-t', session.psmux_name],
    });
    this.trackTerminal(session.id, terminal);
    terminal.show();
  }

  focusTerminal(sessionId: number): void {
    const terminal = this.terminalMap.get(sessionId);
    if (terminal) terminal.show();
  }

  async handleTerminalClose(closedTerminal: vscode.Terminal): Promise<void> {
    const sessionId = this.reverseMap.get(closedTerminal);
    if (sessionId === undefined) return;
    this.terminalMap.delete(sessionId);
    // Voluntary dispose during task switch: keep session 'running' so it reattaches next time.
    if (this.disposingTerminals.has(closedTerminal)) return;
    await this.sessionRepo.update(sessionId, { status: 'stopped' });
  }

  /**
   * Restart a session in place: kill the old psmux session, spawn a new
   * one with the same psmux name/tab-label/kind, and re-launch the Agent
   * (with `--resume <claude_session_id>` if previously captured). The
   * DB row id is preserved; status flips back to 'running' and
   * ended_at is cleared.
   */
  async restartSession(sessionId: number): Promise<void> {
    const session = await this.sessionRepo.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const existing = this.terminalMap.get(sessionId);
    if (existing) {
      this.disposingTerminals.add(existing);
      this.terminalMap.delete(sessionId);
      existing.dispose();
    }
    this.psmux.killSession(session.psmux_name);
    this.psmux.createSession(session.psmux_name);

    const terminal = vscode.window.createTerminal({
      name: session.tab_label,
      location: vscode.TerminalLocation.Editor,
      shellPath: this.psmux.binary,
      shellArgs: ['attach', '-t', session.psmux_name],
    });
    this.trackTerminal(session.id, terminal);

    if (this.agentRegistry.shouldLaunch(session.kind)) {
      const adapter = this.agentRegistry.resolve(session.agent);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      const cwd = resolveCwd(session, workspaceRoot);
      const resumeArgs = session.claude_session_id
        ? ' ' + adapter.resumeFlag(session.claude_session_id).join(' ')
        : '';
      this.psmux.sendKeys(session.psmux_name, `cd ${cwd} && ${adapter.command}${resumeArgs}`);
    }

    await this.sessionRepo.update(sessionId, { status: 'running', ended_at: null });
  }

  /** Stop a running session: kill the psmux session and mark the row 'stopped'. */
  async stopSession(sessionId: number): Promise<void> {
    const session = await this.sessionRepo.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const terminal = this.terminalMap.get(sessionId);
    if (terminal) {
      this.disposingTerminals.add(terminal);
      this.terminalMap.delete(sessionId);
      terminal.dispose();
    }
    this.psmux.killSession(session.psmux_name);
    await this.sessionRepo.update(sessionId, {
      status: 'stopped',
      ended_at: new Date().toISOString(),
    });
  }

  getTerminalForSession(sessionId: number): vscode.Terminal | undefined {
    return this.terminalMap.get(sessionId);
  }

  getSessionIdForTerminal(terminal: vscode.Terminal): number | undefined {
    return this.reverseMap.get(terminal);
  }

  private trackTerminal(sessionId: number, terminal: vscode.Terminal): void {
    this.terminalMap.set(sessionId, terminal);
    this.reverseMap.set(terminal, sessionId);
  }
}
