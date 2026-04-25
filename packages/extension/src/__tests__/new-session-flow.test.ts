import { describe, it, expect, vi } from 'vitest';
import type { Session, SessionKind, SessionRepository } from '@tackle/shared';
import { NewSessionFlow, computeAutoLabel } from '../session/new-session-flow';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    task_id: 42,
    phase_id: null,
    name: 'sess',
    kind: 'implement',
    status: 'running',
    psmux_name: 'tackle-gh-42-implement1',
    tab_label: 'implement',
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

function mockSessions(sessions: Session[]): SessionRepository {
  return {
    list: vi.fn(async () => sessions),
    get: vi.fn(async (id: number) => sessions.find((s) => s.id === id)),
    listForTask: vi.fn(async (taskId: number) => sessions.filter((s) => s.task_id === taskId)),
    create: vi.fn(),
    update: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    softDelete: vi.fn(async () => {}),
  } as unknown as SessionRepository;
}

describe('computeAutoLabel', () => {
  it('returns bare kind when no sessions of that kind exist for the task', () => {
    expect(computeAutoLabel([], 'implement')).toBe('implement');
  });

  it('returns <kind>-<n> for subsequent sessions of same kind', () => {
    const existing = [makeSession({ id: 1, task_id: 42, kind: 'implement' })];
    expect(computeAutoLabel(existing, 'implement')).toBe('implement-2');
  });

  it('counts only matching kind', () => {
    const existing = [
      makeSession({ id: 1, task_id: 42, kind: 'implement' }),
      makeSession({ id: 2, task_id: 42, kind: 'debug' }),
      makeSession({ id: 3, task_id: 42, kind: 'implement' }),
    ];
    expect(computeAutoLabel(existing, 'implement')).toBe('implement-3');
    expect(computeAutoLabel(existing, 'debug')).toBe('debug-2');
    expect(computeAutoLabel(existing, 'plan')).toBe('plan');
  });
});

describe('NewSessionFlow.start', () => {
  function makeOrchestrator() {
    return {
      createTerminal: vi.fn(async (opts: any) =>
        makeSession({
          id: 99,
          task_id: opts.taskId,
          kind: opts.kind,
          tab_label: opts.tab_label ?? opts.kind,
        }),
      ),
    };
  }
  function makeScope(activeTaskId: number | undefined) {
    return {
      activeTaskId,
      getActiveTaskId: () => activeTaskId,
      switchTask: vi.fn(async (id: number) => {
        /* noop */
      }),
    };
  }

  it('returns undefined and does not create when pickKind is cancelled', async () => {
    const sessions = mockSessions([]);
    const orchestrator = makeOrchestrator();
    const scope = makeScope(42);
    const flow = new NewSessionFlow({
      sessions,
      orchestrator: orchestrator as any,
      scope,
      pickKind: async () => undefined,
    });
    const result = await flow.start(42);
    expect(result).toBeUndefined();
    expect(orchestrator.createTerminal).not.toHaveBeenCalled();
    expect(scope.switchTask).not.toHaveBeenCalled();
  });

  it('happy path: calls orchestrator.createTerminal with computed auto-label', async () => {
    const existing = [makeSession({ id: 1, task_id: 42, kind: 'implement' })];
    const sessions = mockSessions(existing);
    const orchestrator = makeOrchestrator();
    const scope = makeScope(42);
    const flow = new NewSessionFlow({
      sessions,
      orchestrator: orchestrator as any,
      scope,
      pickKind: async () => 'implement' as SessionKind,
    });
    const result = await flow.start(42);
    expect(orchestrator.createTerminal).toHaveBeenCalledTimes(1);
    const arg = orchestrator.createTerminal.mock.calls[0][0];
    expect(arg.taskId).toBe(42);
    expect(arg.kind).toBe('implement');
    expect(arg.tabLabel).toBe('implement-2');
    expect(result?.id).toBe(99);
    expect(scope.switchTask).not.toHaveBeenCalled();
  });

  it('activates non-active target task before creating', async () => {
    const sessions = mockSessions([]);
    const orchestrator = makeOrchestrator();
    const scope = makeScope(7);
    const flow = new NewSessionFlow({
      sessions,
      orchestrator: orchestrator as any,
      scope,
      pickKind: async () => 'plan' as SessionKind,
    });
    await flow.start(42);
    expect(scope.switchTask).toHaveBeenCalledWith(42);
    expect(orchestrator.createTerminal).toHaveBeenCalledTimes(1);
    // switchTask is called before createTerminal
    const switchOrder = scope.switchTask.mock.invocationCallOrder[0];
    const createOrder = orchestrator.createTerminal.mock.invocationCallOrder[0];
    expect(switchOrder).toBeLessThan(createOrder);
  });

  it('does not switch when target equals active task', async () => {
    const sessions = mockSessions([]);
    const orchestrator = makeOrchestrator();
    const scope = makeScope(42);
    const flow = new NewSessionFlow({
      sessions,
      orchestrator: orchestrator as any,
      scope,
      pickKind: async () => 'plan' as SessionKind,
    });
    await flow.start(42);
    expect(scope.switchTask).not.toHaveBeenCalled();
  });

  describe('α-isolation toggle', () => {
    function makeTaskRepo(taskWorktreePath: string | null = '/wt/task-42') {
      return {
        get: vi.fn(async (_id: number) => ({
          id: 42,
          external_id: '42',
          worktree_path: taskWorktreePath,
          worktree_branch: '42-foo',
          worktree_base_branch: 'main',
        tackle_status: "not_started",
        })),
      };
    }

    it('does NOT call pickIsolate when no Task worktree exists yet', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const pickIsolate = vi.fn(async () => false);
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        pickIsolate,
        taskRepo: makeTaskRepo(null) as any,
      });
      await flow.start(42);
      expect(pickIsolate).not.toHaveBeenCalled();
      const arg = orchestrator.createTerminal.mock.calls[0][0];
      expect(arg.worktreePath).toBeFalsy();
    });

    it('does NOT call pickIsolate for non-impl kinds (plan, review, shell)', async () => {
      for (const kind of ['plan', 'review', 'shell'] as SessionKind[]) {
        const sessions = mockSessions([]);
        const orchestrator = makeOrchestrator();
        const scope = makeScope(42);
        const pickIsolate = vi.fn(async () => false);
        const flow = new NewSessionFlow({
          sessions,
          orchestrator: orchestrator as any,
          scope,
          pickKind: async () => kind,
          pickIsolate,
          taskRepo: makeTaskRepo() as any,
        });
        await flow.start(42);
        expect(pickIsolate).not.toHaveBeenCalled();
      }
    });

    it('calls pickIsolate for impl-like kinds when Task worktree exists', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const pickIsolate = vi.fn(async () => false);
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        pickIsolate,
        taskRepo: makeTaskRepo() as any,
      });
      await flow.start(42);
      expect(pickIsolate).toHaveBeenCalledTimes(1);
    });

    it('when toggle ON: calls provisioner.createIsolatedWorktree and forwards path as worktreePath', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const pickIsolate = vi.fn(async () => true);
      const createIsolatedWorktree = vi.fn(async (_task: any, _ref: number) => ({
        path: '/wt/task-42-iso',
        branch: '42-foo-iso',
        baseBranch: 'main',
      }));
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        pickIsolate,
        taskRepo: makeTaskRepo() as any,
        worktreeProvisioner: { createIsolatedWorktree } as any,
      });
      await flow.start(42);
      expect(createIsolatedWorktree).toHaveBeenCalledTimes(1);
      const arg = orchestrator.createTerminal.mock.calls[0][0];
      expect(arg.worktreePath).toBe('/wt/task-42-iso');
    });

    it('when toggle OFF: does not call createIsolatedWorktree', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const pickIsolate = vi.fn(async () => false);
      const createIsolatedWorktree = vi.fn();
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        pickIsolate,
        taskRepo: makeTaskRepo() as any,
        worktreeProvisioner: { createIsolatedWorktree } as any,
      });
      await flow.start(42);
      expect(createIsolatedWorktree).not.toHaveBeenCalled();
      const arg = orchestrator.createTerminal.mock.calls[0][0];
      expect(arg.worktreePath).toBeFalsy();
    });

    it('cancelling pickIsolate (undefined) aborts session creation', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const pickIsolate = vi.fn(async () => undefined);
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        pickIsolate,
        taskRepo: makeTaskRepo() as any,
      });
      const result = await flow.start(42);
      expect(result).toBeUndefined();
      expect(orchestrator.createTerminal).not.toHaveBeenCalled();
    });
  });

  describe('Tackle Status dispatch on plan kind', () => {
    it('dispatches task.plan_started when a plan Session is created', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const dispatch = vi.fn();
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'plan' as SessionKind,
        eventBus: { dispatch } as any,
      });
      await flow.start(42);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'task.plan_started',
        task_id: 42,
        source: 'ui',
      });
    });

    it('does not dispatch task.plan_started for non-plan kinds', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const dispatch = vi.fn();
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'implement' as SessionKind,
        eventBus: { dispatch } as any,
      });
      await flow.start(42);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('swallows dispatch errors (illegal-transition) to keep Session creation succeeding', async () => {
      const sessions = mockSessions([]);
      const orchestrator = makeOrchestrator();
      const scope = makeScope(42);
      const dispatch = vi.fn(() => {
        throw new Error('illegal transition plan_approved → plan_started');
      });
      const flow = new NewSessionFlow({
        sessions,
        orchestrator: orchestrator as any,
        scope,
        pickKind: async () => 'plan' as SessionKind,
        eventBus: { dispatch } as any,
      });
      const result = await flow.start(42);
      expect(result?.id).toBe(99);
    });
  });
});
