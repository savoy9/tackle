import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session, SessionRepository } from '@tackle/shared';
import { SessionActions } from '../session/session-actions';
import type { TerminalOrchestrator } from '../terminal/terminal-orchestrator';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    task_id: 42,
    phase_id: null,
    name: 'sess',
    kind: 'implement',
    status: 'running',
    psmux_name: 'tackle-gh-42-implement-1',
    tab_label: 'gh-42 implement',
    agent: 'agency-cc',
    worktree_path: null,
    sort_order: 0,
    claude_session_id: null,
    agent_state: 'idle',
    prior_claude_session_ids: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  };
}

function createMocks() {
  const session = makeSession();
  const sessions: SessionRepository = {
    list: vi.fn(async () => [session]),
    get: vi.fn(async (_id: number) => session),
    listForTask: vi.fn(async () => [session]),
    create: vi.fn(),
    update: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    softDelete: vi.fn(async () => {}),
  } as unknown as SessionRepository;

  const orchestrator = {
    stopSession: vi.fn(async () => {}),
    restartSession: vi.fn(async () => {}),
  } as unknown as TerminalOrchestrator;

  const confirm = vi.fn(async () => true);
  return { sessions, orchestrator, confirm, sessionObj: session };
}

describe('SessionActions', () => {
  let mocks: ReturnType<typeof createMocks>;
  let actions: SessionActions;

  beforeEach(() => {
    mocks = createMocks();
    actions = new SessionActions({
      sessions: mocks.sessions,
      orchestrator: mocks.orchestrator,
      confirm: mocks.confirm,
    });
  });

  describe('stop', () => {
    it('delegates to orchestrator.stopSession (which kills psmux + sets status=stopped)', async () => {
      await actions.stop(1);
      expect(mocks.orchestrator.stopSession).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('when session is stopped: skips confirm, stops, and soft-deletes', async () => {
      (mocks.sessions.get as any).mockResolvedValueOnce(makeSession({ status: 'stopped' }));
      await actions.remove(1);
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.orchestrator.stopSession).toHaveBeenCalledWith(1);
      expect(mocks.sessions.softDelete).toHaveBeenCalledWith(1);
    });

    it('when session is running: confirms before stopping + soft-deleting', async () => {
      (mocks.sessions.get as any).mockResolvedValueOnce(makeSession({ status: 'running' }));
      mocks.confirm.mockResolvedValueOnce(true);
      await actions.remove(1);
      expect(mocks.confirm).toHaveBeenCalledTimes(1);
      expect(mocks.orchestrator.stopSession).toHaveBeenCalledWith(1);
      expect(mocks.sessions.softDelete).toHaveBeenCalledWith(1);
    });

    it('when session is running and confirm rejects: no-op', async () => {
      (mocks.sessions.get as any).mockResolvedValueOnce(makeSession({ status: 'running' }));
      mocks.confirm.mockResolvedValueOnce(false);
      await actions.remove(1);
      expect(mocks.orchestrator.stopSession).not.toHaveBeenCalled();
      expect(mocks.sessions.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('updates tab_label on the session', async () => {
      await actions.rename(1, 'new label');
      expect(mocks.sessions.update).toHaveBeenCalledWith(1, { tab_label: 'new label' });
    });
  });

  describe('restart', () => {
    it('delegates to orchestrator.restartSession', async () => {
      await actions.restart(1);
      expect(mocks.orchestrator.restartSession).toHaveBeenCalledWith(1);
    });
  });

  describe('markDone', () => {
    it('stops the session then overwrites status to completed', async () => {
      await actions.markDone(1);
      expect(mocks.orchestrator.stopSession).toHaveBeenCalledWith(1);
      expect(mocks.sessions.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('sets ended_at when marking done', async () => {
      await actions.markDone(1);
      const callArgs = (mocks.sessions.update as any).mock.calls[0][1];
      expect(callArgs.ended_at).toBeTruthy();
    });
  });
});
