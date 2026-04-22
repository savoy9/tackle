import type { SessionRepository } from '@tackle/shared';
import type { TerminalOrchestrator } from '../terminal/terminal-orchestrator';

export interface SessionActionsDeps {
  sessions: SessionRepository;
  orchestrator: Pick<TerminalOrchestrator, 'stopSession' | 'restartSession'>;
  confirm: (msg: string) => Promise<boolean>;
}

export class SessionActions {
  constructor(private readonly deps: SessionActionsDeps) {}

  async stop(id: number): Promise<void> {
    await this.deps.orchestrator.stopSession(id);
  }

  async markDone(id: number): Promise<void> {
    await this.deps.orchestrator.stopSession(id);
    await this.deps.sessions.update(id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
    });
  }

  async restart(id: number): Promise<void> {
    await this.deps.orchestrator.restartSession(id);
  }

  async rename(id: number, newLabel: string): Promise<void> {
    await this.deps.sessions.update(id, { tab_label: newLabel });
  }

  async remove(id: number): Promise<void> {
    const session = await this.deps.sessions.get(id);
    if (!session) return;
    if (session.status === 'running') {
      const ok = await this.deps.confirm(
        `Remove session "${session.tab_label}"? It is currently running.`,
      );
      if (!ok) return;
    }
    await this.deps.orchestrator.stopSession(id);
    await this.deps.sessions.softDelete(id);
  }
}
