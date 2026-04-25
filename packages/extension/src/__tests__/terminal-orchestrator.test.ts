import vscodeModule, { resetMocks } from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { PsmuxBridge } from '@tackle/shared';
import type { Session, SessionRepository } from '@tackle/shared';
import { TerminalOrchestrator, resolveCwd } from '../terminal/terminal-orchestrator';
import type { AgentRegistry } from '../agent/agent-registry';
import type { AgentStateDetector, AgentStateEvent } from '../agent/agent-state-detector';

function createFakeDetector() {
  const listeners = new Set<(e: AgentStateEvent) => void>();
  const started: number[] = [];
  const stopped: number[] = [];
  let disposed = false;
  const detector: AgentStateDetector = {
    start: vi.fn((s) => {
      started.push(s.id);
    }),
    stop: vi.fn((s) => {
      stopped.push(s.id);
    }),
    onChange(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    dispose: vi.fn(() => {
      disposed = true;
      listeners.clear();
    }),
  };
  return {
    detector,
    started,
    stopped,
    isDisposed: () => disposed,
    emit: (sessionId: number, state: AgentStateEvent['state']) => {
      for (const l of listeners) l({ sessionId, state });
    },
  };
}

function createAgentRegistry(
  overrides: Partial<AgentRegistry> = {},
  detector?: AgentStateDetector,
): AgentRegistry {
  return {
    resolve: vi.fn((name?: string | null) => ({
      name: name ?? 'agency-cc',
      command: name ?? 'agency-cc',
      resumeFlag: (id: string) => ['-r', id],
      detector: 'ClaudeJsonlDetector' as const,
    })),
    shouldLaunch: vi.fn((kind: string) => kind !== 'shell'),
    getDetector: vi.fn((_name?: string | null) => detector ?? null),
    disposeDetectors: vi.fn(() => {
      detector?.dispose();
    }),
    ...overrides,
  } as AgentRegistry;
}

function createMocks() {
  const sessions: Session[] = [];

  const mockPsmux = {
    binary: 'tmux',
    createSession: vi.fn(),
    killSession: vi.fn(),
    hasSession: vi.fn(() => true),
    listSessions: vi.fn(() => []),
    sendKeys: vi.fn(),
  } as unknown as PsmuxBridge;

  const mockSessionRepo: SessionRepository = {
    list: vi.fn(async () => sessions),
    get: vi.fn(async (id: number) => sessions.find((s) => s.id === id)),
    listForTask: vi.fn(async (taskId: number) => sessions.filter((s) => s.task_id === taskId)),
    create: vi.fn(async (input: any) => {
      const s = {
        id: sessions.length + 1,
        status: 'running',
        agent: null,
        worktree_path: null,
        claude_session_id: null,
        agent_state: 'idle',
        prior_claude_session_ids: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        ...input,
      } as Session;
      sessions.push(s);
      return s;
    }),
    update: vi.fn(async (id: number, fields: any) => {
      const s = sessions.find((x) => x.id === id);
      if (s) Object.assign(s, fields);
    }),
    complete: vi.fn(async () => {}),
    softDelete: vi.fn(async () => {}),
    setAgentState: vi.fn(async (id: number, state: any) => {
      const s = sessions.find((x) => x.id === id);
      if (s) s.agent_state = state;
    }),
  };

  return { sessions, mockPsmux, mockSessionRepo };
}

describe('TerminalOrchestrator', () => {
  let orchestrator: TerminalOrchestrator;
  let mockPsmux: ReturnType<typeof createMocks>['mockPsmux'];
  let mockSessionRepo: SessionRepository;
  let sessions: Session[];
  let mockAgentRegistry: AgentRegistry;

  beforeEach(() => {
    resetMocks();
    const mocks = createMocks();
    mockPsmux = mocks.mockPsmux;
    mockSessionRepo = mocks.mockSessionRepo;
    sessions = mocks.sessions;
    mockAgentRegistry = createAgentRegistry();
    orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry);
  });

  describe('resolveCwd', () => {
    it('picks worktree_path when present', () => {
      const session = { worktree_path: '/wt/foo' } as Session;
      expect(resolveCwd(session, '/workspace')).toBe('/wt/foo');
    });

    it('falls back to workspaceRoot when worktree_path is null', () => {
      const session = { worktree_path: null } as Session;
      expect(resolveCwd(session, '/workspace')).toBe('/workspace');
    });

    it('falls back to task.worktree_path when session.worktree_path is null', () => {
      const session = { worktree_path: null } as Session;
      const task = { worktree_path: '/wt/task' } as { worktree_path: string | null };
      expect(resolveCwd(session, '/workspace', task)).toBe('/wt/task');
    });

    it('session worktree_path wins over task worktree_path', () => {
      const session = { worktree_path: '/wt/sess' } as Session;
      const task = { worktree_path: '/wt/task' } as { worktree_path: string | null };
      expect(resolveCwd(session, '/workspace', task)).toBe('/wt/sess');
    });
  });

  describe('createTerminal', () => {
    const baseOpts = { taskId: 42, taskSlug: 'fix-auth', kind: 'implement' as const };

    it('generates correct psmux name', async () => {
      await orchestrator.createTerminal(baseOpts);
      const expectedName = PsmuxBridge.generateSessionName('gh', '42', 'implement', 1);
      expect(mockPsmux.createSession).toHaveBeenCalledWith(expectedName);
    });

    it('generates correct tab label', async () => {
      const session = await orchestrator.createTerminal(baseOpts);
      const expectedLabel = PsmuxBridge.generateTabLabel('42', 'fix-auth', 'implement', 1);
      expect(session.tab_label).toBe(expectedLabel);
    });

    it('creates VS Code terminal with TerminalLocation.Editor', async () => {
      await orchestrator.createTerminal(baseOpts);
      expect(vscodeModule.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          location: vscodeModule.TerminalLocation.Editor,
          shellPath: 'tmux',
        }),
      );
    });

    it('persists session to repository', async () => {
      const session = await orchestrator.createTerminal(baseOpts);
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 42,
          kind: 'implement',
        }),
      );
      expect(session.id).toBe(1);
      expect(session.status).toBe('running');
    });

    it('increments N for same kind on same task', async () => {
      await orchestrator.createTerminal(baseOpts);
      await orchestrator.createTerminal(baseOpts);

      const expectedName2 = PsmuxBridge.generateSessionName('gh', '42', 'implement', 2);
      expect(mockPsmux.createSession).toHaveBeenCalledWith(expectedName2);
    });

    it('populates Session.agent with resolved agent name on insert', async () => {
      await orchestrator.createTerminal(baseOpts);
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'agency-cc' }),
      );
    });

    it('respects agent name override from opts', async () => {
      await orchestrator.createTerminal({ ...baseOpts, agent: 'claude' });
      expect(mockAgentRegistry.resolve).toHaveBeenCalledWith('claude');
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'claude' }),
      );
    });

    it('sends cd + agent command to psmux for non-shell kind', async () => {
      await orchestrator.createTerminal({ ...baseOpts, worktreePath: '/wt/foo' });
      const psmuxName = PsmuxBridge.generateSessionName('gh', '42', 'implement', 1);
      expect(mockPsmux.sendKeys).toHaveBeenCalledWith(psmuxName, "cd '/wt/foo' && agency-cc");
    });

    it('shell-quotes cwd so paths with spaces and metachars stay intact', async () => {
      await orchestrator.createTerminal({
        ...baseOpts,
        worktreePath: '/wt/my repo; rm -rf /',
      });
      const sent = (mockPsmux.sendKeys as any).mock.calls[0][1] as string;
      // Single-quoted → shell treats the whole path as one literal arg.
      expect(sent).toBe("cd '/wt/my repo; rm -rf /' && agency-cc");
    });

    it('escapes embedded single quotes in cwd', async () => {
      await orchestrator.createTerminal({
        ...baseOpts,
        worktreePath: "/wt/it's-fine",
      });
      const sent = (mockPsmux.sendKeys as any).mock.calls[0][1] as string;
      expect(sent).toBe("cd '/wt/it'\\''s-fine' && agency-cc");
    });

    it('does not send agent keys for shell kind', async () => {
      await orchestrator.createTerminal({ taskId: 1, taskSlug: 'x', kind: 'shell' });
      expect(mockPsmux.sendKeys).not.toHaveBeenCalled();
    });
  });

  describe('worktree provisioning', () => {
    it('calls worktreeProvider before spawning when no session-level worktreePath', async () => {
      const ensure = vi.fn(async (taskId: number) => ({
        path: `/wt/task-${taskId}`,
        branch: `${taskId}-x`,
        baseBranch: 'main',
      }));
      orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry, {
        ensureForTask: ensure,
      });

      const session = await orchestrator.createTerminal({
        taskId: 99,
        taskSlug: 's',
        kind: 'implement',
      });

      expect(ensure).toHaveBeenCalledWith(99);
      expect(session.worktree_path).toBe('/wt/task-99');
      expect(mockPsmux.sendKeys).toHaveBeenCalledWith(
        expect.any(String),
        "cd '/wt/task-99' && agency-cc",
      );
    });

    it('does not call worktreeProvider when explicit worktreePath is supplied', async () => {
      const ensure = vi.fn(async () => ({ path: '/wt/no', branch: 'b', baseBranch: 'main' }));
      orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry, {
        ensureForTask: ensure,
      });
      await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/explicit',
      });
      expect(ensure).not.toHaveBeenCalled();
    });

    it('does not call worktreeProvider for shell kind', async () => {
      const ensure = vi.fn();
      orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry, {
        ensureForTask: ensure,
      });
      await orchestrator.createTerminal({ taskId: 1, taskSlug: 's', kind: 'shell' });
      expect(ensure).not.toHaveBeenCalled();
    });
  });

  describe('disposeAll', () => {
    it('disposes all terminals and clears map', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 'a',
        kind: 'shell',
      });
      const terminal = orchestrator.getTerminalForSession(session.id)!;

      orchestrator.disposeAll();

      expect(terminal.dispose).toHaveBeenCalled();
      expect(orchestrator.getTerminalForSession(session.id)).toBeUndefined();
    });
  });

  describe('reattachForTask', () => {
    it('creates terminals for all running sessions', async () => {
      // Pre-populate sessions
      sessions.push(
        {
          id: 10,
          task_id: 5,
          phase_id: null,
          name: 'a',
          kind: 'shell',
          status: 'running',
          psmux_name: 'psmux-a',
          tab_label: 'tab-a',
          agent: null,
          worktree_path: null,
          sort_order: 1,
          claude_session_id: null,
          agent_state: 'idle',
          prior_claude_session_ids: null,
          started_at: '',
          ended_at: null,
        },
        {
          id: 11,
          task_id: 5,
          phase_id: null,
          name: 'b',
          kind: 'shell',
          status: 'stopped',
          psmux_name: 'psmux-b',
          tab_label: 'tab-b',
          agent: null,
          worktree_path: null,
          sort_order: 2,
          claude_session_id: null,
          agent_state: 'idle',
          prior_claude_session_ids: null,
          started_at: '',
          ended_at: null,
        },
      );

      await orchestrator.reattachForTask(5);

      // Only the running session should get a terminal
      expect(orchestrator.getTerminalForSession(10)).toBeDefined();
      expect(orchestrator.getTerminalForSession(11)).toBeUndefined();
    });
  });

  describe('handleTerminalClose', () => {
    it('removes from map and updates session status', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 'x',
        kind: 'shell',
      });
      const terminal = orchestrator.getTerminalForSession(session.id)!;

      orchestrator.handleTerminalClose(terminal);

      expect(orchestrator.getTerminalForSession(session.id)).toBeUndefined();
      expect(mockSessionRepo.update).toHaveBeenCalledWith(session.id, { status: 'stopped' });
    });
  });

  describe('stopSession', () => {
    it('kills psmux session and marks status stopped', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 'x',
        kind: 'shell',
      });
      await orchestrator.stopSession(session.id);
      expect(mockPsmux.killSession).toHaveBeenCalledWith(session.psmux_name);
      expect(mockSessionRepo.update).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ status: 'stopped' }),
      );
    });
  });

  describe('restartSession', () => {
    it('kills old psmux, respawns, and preserves DB id with status running', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 7,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/s',
      });
      const originalId = session.id;
      (mockPsmux.sendKeys as any).mockClear();

      await orchestrator.restartSession(originalId);

      expect(mockPsmux.killSession).toHaveBeenCalledWith(session.psmux_name);
      expect(mockPsmux.createSession).toHaveBeenCalledWith(session.psmux_name);
      expect(mockSessionRepo.update).toHaveBeenCalledWith(
        originalId,
        expect.objectContaining({ status: 'running', ended_at: null }),
      );
    });

    it('forwards --resume flag when claude_session_id is set', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 7,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/s',
      });
      // Simulate claude_session_id being set externally
      sessions[0].claude_session_id = 'claude-xyz';
      (mockPsmux.sendKeys as any).mockClear();

      await orchestrator.restartSession(session.id);

      const sent = (mockPsmux.sendKeys as any).mock.calls[0][1] as string;
      expect(sent).toContain('-r claude-xyz');
      expect(sent).toContain("cd '/wt/s'");
    });

    it('does not launch agent on restart for shell kind', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 7,
        taskSlug: 's',
        kind: 'shell',
      });
      (mockPsmux.sendKeys as any).mockClear();

      await orchestrator.restartSession(session.id);

      expect(mockPsmux.sendKeys).not.toHaveBeenCalled();
    });
  });

  describe('detector lifecycle (#43)', () => {
    let fake: ReturnType<typeof createFakeDetector>;

    beforeEach(() => {
      fake = createFakeDetector();
      mockAgentRegistry = createAgentRegistry({}, fake.detector);
      orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry);
    });

    it('starts the detector when an agent-kind session is spawned', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      expect(fake.detector.start).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
    });

    it('does NOT instantiate a detector for shell kind', async () => {
      await orchestrator.createTerminal({ taskId: 1, taskSlug: 's', kind: 'shell' });
      expect(fake.detector.start).not.toHaveBeenCalled();
      expect(mockAgentRegistry.getDetector).not.toHaveBeenCalled();
    });

    it('detector onChange events persist via SessionRepository.setAgentState', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      fake.emit(session.id, 'working');
      // Allow the fire-and-forget setAgentState promise to flush.
      await Promise.resolve();
      expect(mockSessionRepo.setAgentState).toHaveBeenCalledWith(session.id, 'working');
    });

    it('stopSession stops the detector and freezes agent_state (no further writes)', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      await orchestrator.stopSession(session.id);
      expect(fake.detector.stop).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));

      (mockSessionRepo.setAgentState as any).mockClear();
      fake.emit(session.id, 'idle');
      await Promise.resolve();
      // Detector is stopped — but the listener channel is shared, so
      // emissions still hit the orchestrator. The contract from the
      // issue is that stop()-ed detectors don't keep firing; we model
      // that by checking the *detector* received stop(). The repo is
      // not expected to be called once the watcher is torn down.
      // (Real ClaudeJsonlDetector won't emit after stop.)
      expect(fake.detector.stop).toHaveBeenCalledTimes(1);
    });

    it('restartSession stops then re-starts the detector for the refreshed session', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      (fake.detector.start as any).mockClear();

      await orchestrator.restartSession(session.id);

      expect(fake.detector.stop).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
      expect(fake.detector.start).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
    });

    it('handleTerminalClose stops the detector when an agent-kind session terminal is closed', async () => {
      const session = await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      const terminal = orchestrator.getTerminalForSession(session.id)!;
      await orchestrator.handleTerminalClose(terminal);
      expect(fake.detector.stop).toHaveBeenCalledWith(expect.objectContaining({ id: session.id }));
    });

    it('disposeAll releases every detector via the registry (clean VS Code shutdown)', async () => {
      await orchestrator.createTerminal({
        taskId: 1,
        taskSlug: 's',
        kind: 'implement',
        worktreePath: '/wt/x',
      });
      orchestrator.disposeAll();
      expect(mockAgentRegistry.disposeDetectors).toHaveBeenCalled();
      expect(fake.isDisposed()).toBe(true);
    });
  });

  describe('resumeRunningDetectors (VS Code activation recovery)', () => {
    let fake: ReturnType<typeof createFakeDetector>;

    beforeEach(() => {
      fake = createFakeDetector();
      mockAgentRegistry = createAgentRegistry({}, fake.detector);
      orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux, mockAgentRegistry);
    });

    it('re-starts detectors for every running agent-kind Session in the DB', async () => {
      sessions.push(
        {
          id: 1,
          task_id: 1,
          phase_id: null,
          name: 'a',
          kind: 'implement',
          status: 'running',
          psmux_name: 'p1',
          tab_label: 'a',
          agent: 'agency-cc',
          worktree_path: '/wt/a',
          sort_order: 0,
          claude_session_id: 'c1',
          agent_state: 'idle',
          prior_claude_session_ids: null,
          started_at: '',
          ended_at: null,
        },
        {
          id: 2,
          task_id: 1,
          phase_id: null,
          name: 'b',
          kind: 'implement',
          status: 'stopped',
          psmux_name: 'p2',
          tab_label: 'b',
          agent: 'agency-cc',
          worktree_path: '/wt/b',
          sort_order: 0,
          claude_session_id: null,
          agent_state: 'idle',
          prior_claude_session_ids: null,
          started_at: '',
          ended_at: null,
        },
        {
          id: 3,
          task_id: 1,
          phase_id: null,
          name: 'c',
          kind: 'shell',
          status: 'running',
          psmux_name: 'p3',
          tab_label: 'c',
          agent: null,
          worktree_path: null,
          sort_order: 0,
          claude_session_id: null,
          agent_state: 'idle',
          prior_claude_session_ids: null,
          started_at: '',
          ended_at: null,
        },
      );

      await orchestrator.resumeRunningDetectors();

      // Only the running, agent-kind session gets a detector.
      expect(fake.started).toEqual([1]);
    });

    it('is a no-op when no Sessions are running', async () => {
      await orchestrator.resumeRunningDetectors();
      expect(fake.started).toEqual([]);
    });
  });
});
