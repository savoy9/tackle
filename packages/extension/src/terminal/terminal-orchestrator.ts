import * as vscode from 'vscode';
import { PsmuxBridge } from '@tackle/shared';
import type { SessionRepository, Session, SessionKind } from '@tackle/shared';

export class TerminalOrchestrator {
  private terminalMap = new Map<number, vscode.Terminal>();
  private reverseMap = new WeakMap<vscode.Terminal, number>();
  private disposingTerminals = new WeakSet<vscode.Terminal>();

  constructor(
    private sessionRepo: SessionRepository,
    private psmux: PsmuxBridge,
  ) {}

  async createTerminal(opts: {
    taskId: number;
    taskSlug: string;
    kind: SessionKind;
    source?: string;
    label?: string;
  }): Promise<Session> {
    const source = opts.source ?? 'gh';

    const existing = await this.sessionRepo.listForTask(opts.taskId);
    const n = existing.filter(s => s.kind === opts.kind).length + 1;

    const psmuxName = PsmuxBridge.generateSessionName(source, String(opts.taskId), opts.kind, n);
    const tabLabel = PsmuxBridge.generateTabLabel(String(opts.taskId), opts.taskSlug, opts.kind, n, opts.label);

    this.psmux.createSession(psmuxName);

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
    });

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
