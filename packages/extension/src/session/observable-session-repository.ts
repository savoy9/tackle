import type { Session, SessionRepository, CreateSession, UpdateSession, AgentState } from '@tackle/shared';

type Listener = () => void;

/**
 * Decorator around any SessionRepository that fires a `change` event after
 * every mutation, so the sidebar controller can push fresh state.
 */
export class ObservableSessionRepository implements SessionRepository {
  private listeners: Listener[] = [];

  constructor(private inner: SessionRepository) {}

  onDidChange(listener: Listener): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  }

  /** Manually fire the change event. Useful for external mutations (e.g. the
   *  terminal orchestrator creating terminals that indirectly touch sessions). */
  fire(): void {
    for (const l of this.listeners) l();
  }

  list(): Promise<Session[]> { return this.inner.list(); }
  get(id: number): Promise<Session | undefined> { return this.inner.get(id); }
  listForTask(taskId: number): Promise<Session[]> { return this.inner.listForTask(taskId); }

  async create(session: CreateSession): Promise<Session> {
    const created = await this.inner.create(session);
    this.fire();
    return created;
  }
  async update(id: number, fields: UpdateSession): Promise<void> {
    await this.inner.update(id, fields);
    this.fire();
  }
  async complete(id: number): Promise<void> {
    await this.inner.complete(id);
    this.fire();
  }
  async softDelete(id: number): Promise<void> {
    await this.inner.softDelete(id);
    this.fire();
  }
  async setAgentState(id: number, state: AgentState): Promise<void> {
    await this.inner.setAgentState(id, state);
    this.fire();
  }
}
