import type { Task, Phase } from '@tackle/shared';
import type { Database } from './db';
import type { PsmuxManager } from './psmux-manager';
import { SessionManager } from './session-manager';

export class WorkspaceManager {
  private _currentTaskId: number | null = null;
  private _currentSessionName: string | null = null;
  private _sessionManager: SessionManager;
  private createdWindows = new Set<number>(); // phase IDs with tmux windows

  constructor(
    private db: Database,
    private psmux: PsmuxManager,
  ) {
    // Start with a dummy session manager (no psmux session)
    this._sessionManager = new SessionManager(db, psmux, 'chartroom-none');
  }

  get currentTaskId(): number | null {
    return this._currentTaskId;
  }

  get currentSessionName(): string | null {
    return this._currentSessionName;
  }

  get sessionManager(): SessionManager {
    return this._sessionManager;
  }

  /**
   * Derives a psmux session name from a task's DB row.
   */
  sessionNameForTask(taskId: number): string {
    const task = this.db.prepare<Task>('SELECT * FROM tasks WHERE id = ?').get(taskId) as
      | Task
      | undefined;

    if (!task) throw new Error(`Task ${taskId} not found`);

    return `chartroom-${task.external_system}-${task.external_id}`;
  }

  /**
   * Switch the workspace to a different task.
   * Creates the psmux session if it doesn't exist.
   * Returns the psmux session name.
   */
  switchTask(taskId: number): string {
    const sessionName = this.sessionNameForTask(taskId);

    if (!this.psmux.hasSession(sessionName)) {
      this.psmux.createSession(sessionName);
    }

    this._currentTaskId = taskId;
    this._currentSessionName = sessionName;
    this._sessionManager = new SessionManager(this.db, this.psmux, sessionName);
    this.createdWindows.clear();

    return sessionName;
  }

  /**
   * Derive a tmux window name from a phase: "{sort_order}-{slugified-name}"
   */
  private windowNameForPhase(phase: Phase): string {
    const slug = phase.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${phase.sort_order}-${slug}`;
  }

  /**
   * Ensure a tmux window exists for a phase in the current task's psmux session.
   */
  ensurePhaseWindow(phaseId: number): string {
    if (!this._currentSessionName) throw new Error('No task selected');

    if (this.createdWindows.has(phaseId)) {
      const phase = this.db
        .prepare<Phase>('SELECT * FROM phases WHERE id = ?')
        .get(phaseId) as Phase;
      return this.windowNameForPhase(phase);
    }

    const phase = this.db.prepare<Phase>('SELECT * FROM phases WHERE id = ?').get(phaseId) as
      | Phase
      | undefined;

    if (!phase) throw new Error(`Phase ${phaseId} not found`);

    const windowName = this.windowNameForPhase(phase);

    // Check if window already exists
    const windows = this.psmux.listWindows(this._currentSessionName);
    if (!windows.some((w) => w.name === windowName)) {
      this.psmux.createWindow(this._currentSessionName, windowName);
    }

    this.createdWindows.add(phaseId);
    return windowName;
  }

  /**
   * Switch the active tmux window to the given phase, or back to the default window.
   */
  selectPhase(phaseId: number | null): void {
    if (!this._currentSessionName) throw new Error('No task selected');

    if (phaseId === null) {
      // Select the first (default/overview) window
      const windows = this.psmux.listWindows(this._currentSessionName);
      if (windows.length > 0) {
        this.psmux.selectWindow(this._currentSessionName, windows[0].name);
      }
      return;
    }

    const windowName = this.ensurePhaseWindow(phaseId);
    this.psmux.selectWindow(this._currentSessionName, windowName);
  }
}
