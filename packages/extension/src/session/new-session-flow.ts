import type { Session, SessionKind, SessionRepository, Task, TaskRepository } from '@tackle/shared';
import type { TerminalOrchestrator } from '../terminal/terminal-orchestrator';
import { shouldOfferIsolation } from './pick-kind';

/**
 * Compute the auto-generated tab_label for a new session.
 * Format: bare kind name for the first session of that kind on the task,
 * then `<kind>-2`, `<kind>-3`, ... for subsequent sessions.
 */
export function computeAutoLabel(existing: Session[], kind: SessionKind): string {
  const n = existing.filter((s) => s.kind === kind).length + 1;
  return n === 1 ? kind : `${kind}-${n}`;
}

export interface NewSessionFlowScope {
  getActiveTaskId(): number | undefined;
  switchTask?: (taskId: number) => Promise<void>;
}

/**
 * Minimal slice of WorktreeProvisioner needed by NewSessionFlow for
 * α-isolation. Kept narrow so flow tests can mock without the disk machinery.
 */
export interface IsolationProvisioner {
  createIsolatedWorktree(
    task: Task,
    sessionRef: number | string,
  ): Promise<{ path: string; branch: string; baseBranch: string }>;
}

export interface NewSessionFlowDeps {
  sessions: Pick<SessionRepository, 'listForTask'>;
  orchestrator: Pick<TerminalOrchestrator, 'createTerminal'>;
  scope: NewSessionFlowScope;
  /** Shows the kind QuickPick; returns undefined if user cancels. */
  pickKind: () => Promise<SessionKind | undefined>;
  /**
   * Shows the "isolate in new worktree" toggle QuickPick. Returns the user's
   * choice (`true` = isolate, `false` = share), or `undefined` to abort the
   * flow. Only invoked when the kind is impl-like and the Task already has a
   * worktree on disk (see {@link shouldOfferIsolation}).
   */
  pickIsolate?: (kind: SessionKind) => Promise<boolean | undefined>;
  /** Provides access to the Task row so we can detect existing worktree state. */
  taskRepo?: Pick<TaskRepository, 'get'>;
  /** Provisioner used to materialize α-isolation sub-worktrees on demand. */
  worktreeProvisioner?: IsolationProvisioner;
}

/**
 * Coordinates the New Session flow: optional task activation → kind pick →
 * optional α-isolation toggle → auto-label computation → optional sub-worktree
 * provisioning → terminal+session creation.
 */
export class NewSessionFlow {
  constructor(private readonly deps: NewSessionFlowDeps) {}

  async start(taskId: number): Promise<Session | undefined> {
    const { sessions, orchestrator, scope, pickKind, pickIsolate, taskRepo, worktreeProvisioner } =
      this.deps;

    if (scope.getActiveTaskId() !== taskId && scope.switchTask) {
      await scope.switchTask(taskId);
    }

    const kind = await pickKind();
    if (!kind) return undefined;

    // Decide whether to offer the α-isolation toggle. Requires the Task row
    // (so we can see if a worktree already exists) and a pickIsolate callback.
    let isolate = false;
    let cachedTask: Awaited<ReturnType<NonNullable<typeof taskRepo>['get']>> | undefined;
    if (pickIsolate && taskRepo) {
      cachedTask = await taskRepo.get(taskId);
      const taskWorktreeExists = !!cachedTask?.worktree_path;
      if (shouldOfferIsolation(kind, { taskWorktreeExists })) {
        const choice = await pickIsolate(kind);
        if (choice === undefined) return undefined; // user cancelled
        isolate = choice;
      }
    }

    const existing = await sessions.listForTask(taskId);
    const label = computeAutoLabel(existing, kind);

    let isolatedWorktreePath: string | null = null;
    if (isolate && worktreeProvisioner && taskRepo) {
      const task = cachedTask ?? (await taskRepo.get(taskId));
      if (task) {
        const sessionRef = existing.length + 1;
        const wt = await worktreeProvisioner.createIsolatedWorktree(task, sessionRef);
        isolatedWorktreePath = wt.path;
      }
    }

    const created = await orchestrator.createTerminal({
      taskId,
      taskSlug: '',
      kind,
      tabLabel: label,
      worktreePath: isolatedWorktreePath ?? undefined,
    });

    return created;
  }
}
