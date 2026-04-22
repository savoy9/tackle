import type { Session, SessionKind, SessionRepository } from '@tackle/shared';
import type { TerminalOrchestrator } from '../terminal/terminal-orchestrator';

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

export interface NewSessionFlowDeps {
  sessions: Pick<SessionRepository, 'listForTask'>;
  orchestrator: Pick<TerminalOrchestrator, 'createTerminal'>;
  scope: NewSessionFlowScope;
  /** Shows the kind QuickPick; returns undefined if user cancels. */
  pickKind: () => Promise<SessionKind | undefined>;
}

/**
 * Coordinates the New Session flow: optional task activation → kind pick →
 * auto-label computation → terminal+session creation.
 */
export class NewSessionFlow {
  constructor(private readonly deps: NewSessionFlowDeps) {}

  async start(taskId: number): Promise<Session | undefined> {
    const { sessions, orchestrator, scope, pickKind } = this.deps;

    if (scope.getActiveTaskId() !== taskId && scope.switchTask) {
      await scope.switchTask(taskId);
    }

    const kind = await pickKind();
    if (!kind) return undefined;

    const existing = await sessions.listForTask(taskId);
    const label = computeAutoLabel(existing, kind);

    const created = await orchestrator.createTerminal({
      taskId,
      taskSlug: '',
      kind,
      tabLabel: label,
    });

    return created;
  }
}
