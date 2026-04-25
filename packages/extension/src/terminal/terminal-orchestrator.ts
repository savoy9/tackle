import * as vscode from 'vscode';
import { PsmuxBridge } from '@tackle/shared';
import type { SessionRepository, Session, SessionKind } from '@tackle/shared';
import type { AgentRegistry } from '../agent/agent-registry';
import type { AgentStateDetector } from '../agent/agent-state-detector';
import { TestOverride } from '../test-overrides';

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

/**
 * POSIX single-quote a shell argument. Wraps the input in `'…'` and
 * escapes embedded single quotes as `'\''`. Safe for any `bash`/`sh`
 * context — which is what psmux (tmux under the hood) attaches to.
 *
 * Used to quote `cwd` before it's shell-interpolated into
 * `cd <cwd> && <agent command>` via `psmux.sendKeys`. Workspace folders
 * with spaces or shell metacharacters (`$`, `;`, backticks, …) would
 * otherwise break the command or execute arbitrary input.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
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
  /**
   * Track which detector instance is observing each Session, so we can
   * call the right `stop(session)` when a Session transitions out of
   * `running` (or when we restart it). A single detector instance may
   * watch many Sessions — the registry returns shared instances per
   * `DetectorKind`. We keep the full Session object alongside the
   * detector so `stop()` always receives a real row — never a
   * `{ id } as Session` cast — in case a future detector needs more
   * than the id for teardown.
   */
  private sessionDetector = new Map<number, { detector: AgentStateDetector; session: Session }>();
  private detectorListeners: Array<{ dispose(): void }> = [];
  private wiredDetectors = new WeakSet<AgentStateDetector>();

  constructor(
    private sessionRepo: SessionRepository,
    private psmux: PsmuxBridge,
    private agentRegistry: AgentRegistry,
    private worktreeProvider?: SessionWorktreeProvider,
  ) {}

  /**
   * Wire the detector's `onChange` channel into the session repository
   * exactly once per detector instance. The channel is shared across
   * every Session managed by that detector — listeners filter by
   * `sessionId`. We persist the new state via `setAgentState`, which is
   * a single-column UPDATE so the hot path stays cheap.
   */
  private ensureDetectorWired(detector: AgentStateDetector): void {
    if (this.wiredDetectors.has(detector)) return;
    this.wiredDetectors.add(detector);
    const sub = detector.onChange((event) => {
      // Guard against late events: a detector may emit after `stop()` if
      // an fs.watch callback or debounce timer was already queued. If
      // we're no longer tracking this session, drop the event rather
      // than resurrecting `agent_state` on a stopped row.
      if (!this.sessionDetector.has(event.sessionId)) return;
      // fire-and-forget: detector events are high-frequency, and a
      // failed write should not stall the watcher.
      void this.sessionRepo.setAgentState(event.sessionId, event.state);
    });
    this.detectorListeners.push(sub);
  }

  /**
   * Start the per-Session detector if the agent has one and the kind
   * launches an agent. Shell-kind Sessions never get a detector and
   * keep their `agent_state` at the default `idle`.
   */
  private startDetectorFor(session: Session): void {
    if (!this.agentRegistry.shouldLaunch(session.kind)) return;
    const detector = this.agentRegistry.getDetector(session.agent);
    if (!detector) return;
    this.ensureDetectorWired(detector);
    this.sessionDetector.set(session.id, { detector, session });
    detector.start(session);
  }

  /**
   * Stop the per-Session detector if one is attached. The Session's
   * `agent_state` column is left frozen at the last value the detector
   * emitted — the sidebar still shows that glyph until the Session is
   * restarted.
   */
  private stopDetectorFor(session: Session): void {
    const entry = this.sessionDetector.get(session.id);
    if (!entry) return;
    this.sessionDetector.delete(session.id);
    entry.detector.stop(entry.session);
  }

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

    const psmuxName = PsmuxBridge.generateSessionName(source, String(opts.taskId), opts.kind, n, TestOverride.psmuxPrefix);
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
      this.psmux.sendKeys(psmuxName, `cd ${shellQuote(cwd)} && ${adapter.command}`);
    }

    this.trackTerminal(session.id, terminal);
    this.startDetectorFor(session);
    return session;
  }

  disposeAll(): void {
    for (const terminal of this.terminalMap.values()) {
      this.disposingTerminals.add(terminal);
      terminal.dispose();
    }
    this.terminalMap.clear();
    // Release every detector watcher and onChange listener — keeps the
    // agent_state row frozen at its last value but stops file watchers
    // and polling timers so VS Code shutdown is clean.
    for (const sub of this.detectorListeners) sub.dispose();
    this.detectorListeners = [];
    this.sessionDetector.clear();
    this.agentRegistry.disposeDetectors();
  }

  async reattachForTask(taskId: number): Promise<void> {
    const sessions = await this.sessionRepo.listForTask(taskId);
    for (const session of sessions.filter(s => s.status === 'running')) {
      this.attachSession(session);
    }
  }

  /**
   * VS Code activation-time recovery. psmux Sessions survive VS Code
   * restarts (per ADR-0003), so any DB row still marked `running` has a
   * live psmux session out there — we re-start its detector so the
   * sidebar's `agent_state` column resumes updating without the user
   * having to interact. Shell-kind Sessions are skipped (they have no
   * detector to begin with).
   */
  async resumeRunningDetectors(): Promise<void> {
    const all = await this.sessionRepo.list();
    for (const session of all) {
      if (session.status !== 'running') continue;
      this.startDetectorFor(session);
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
    // Detector freezes at last state on a non-voluntary close — stop the
    // watcher so we don't keep emitting against a dead psmux session.
    // Only touch the detector if one was tracked for this session
    // (shell-kind never has one, and avoiding the extra repo.get() keeps
    // the synchronous `update` call where existing tests expect it).
    const entry = this.sessionDetector.get(sessionId);
    if (entry) {
      this.sessionDetector.delete(sessionId);
      entry.detector.stop(entry.session);
    }
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

    // Stop the old detector before tearing down the old psmux session —
    // its file watcher is bound to the previous claude_session_id JSONL.
    this.stopDetectorFor(session);

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
      this.psmux.sendKeys(session.psmux_name, `cd ${shellQuote(cwd)} && ${adapter.command}${resumeArgs}`);
    }

    await this.sessionRepo.update(sessionId, { status: 'running', ended_at: null });
    // Re-fetch so the detector starts against the up-to-date row
    // (specifically, any new claude_session_id captured by the resume).
    const refreshed = await this.sessionRepo.get(sessionId);
    if (refreshed) this.startDetectorFor(refreshed);
  }

  /** Stop a running session: kill the psmux session and mark the row 'stopped'. */
  async stopSession(sessionId: number): Promise<void> {
    const session = await this.sessionRepo.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    this.stopDetectorFor(session);
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
