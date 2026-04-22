import vscodeModule, { resetMocks } from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { PsmuxBridge } from '@tackle/shared';
import type { Session, SessionRepository } from '@tackle/shared';
import { TerminalOrchestrator, resolveCwd } from '../terminal/terminal-orchestrator';
import type { AgentRegistry } from '../agent/agent-registry';

function createAgentRegistry(overrides: Partial<AgentRegistry> = {}): AgentRegistry {
  return {
    resolve: vi.fn((name?: string | null) => ({
      name: name ?? 'agency-cc',
      command: name ?? 'agency-cc',
      resumeFlag: (id: string) => ['-r', id],
    })),
    shouldLaunch: vi.fn((kind: string) => kind !== 'shell'),
    ...overrides,
  } as AgentRegistry;
}

function createMocks() {
  const sessions: Session[] = [];

  const mockPsmux = {
    createSession: vi.fn(),
    killSession: vi.fn(),
    hasSession: vi.fn(() => true),
    listSessions: vi.fn(() => []),
    sendKeys: vi.fn(),
  } as unknown as PsmuxBridge;

  const mockSessionRepo: SessionRepository = {
    list: vi.fn(async () => sessions),
    get: vi.fn(async (id: number) => sessions.find(s => s.id === id)),
    listForTask: vi.fn(async (taskId: number) => sessions.filter(s => s.task_id === taskId)),
    create: vi.fn(async (input: any) => {
      const s = {
        id: sessions.length + 1,
        status: 'running',
        agent: null,
        worktree_path: null,
        claude_session_id: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        ...input,
      } as Session;
      sessions.push(s);
      return s;
    }),
    update: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    softDelete: vi.fn(async () => {}),
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
      expect(mockPsmux.sendKeys).toHaveBeenCalledWith(
        psmuxName,
        'cd /wt/foo && agency-cc',
      );
    });

    it('does not send agent keys for shell kind', async () => {
      await orchestrator.createTerminal({ taskId: 1, taskSlug: 'x', kind: 'shell' });
      expect(mockPsmux.sendKeys).not.toHaveBeenCalled();
    });
  });

  describe('disposeAll', () => {
    it('disposes all terminals and clears map', async () => {
      const session = await orchestrator.createTerminal({ taskId: 1, taskSlug: 'a', kind: 'shell' });
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
        { id: 10, task_id: 5, phase_id: null, name: 'a', kind: 'shell', status: 'running', psmux_name: 'psmux-a', tab_label: 'tab-a', agent: null, worktree_path: null, sort_order: 1, claude_session_id: null, started_at: '', ended_at: null },
        { id: 11, task_id: 5, phase_id: null, name: 'b', kind: 'shell', status: 'stopped', psmux_name: 'psmux-b', tab_label: 'tab-b', agent: null, worktree_path: null, sort_order: 2, claude_session_id: null, started_at: '', ended_at: null },
      );

      await orchestrator.reattachForTask(5);

      // Only the running session should get a terminal
      expect(orchestrator.getTerminalForSession(10)).toBeDefined();
      expect(orchestrator.getTerminalForSession(11)).toBeUndefined();
    });
  });

  describe('handleTerminalClose', () => {
    it('removes from map and updates session status', async () => {
      const session = await orchestrator.createTerminal({ taskId: 1, taskSlug: 'x', kind: 'shell' });
      const terminal = orchestrator.getTerminalForSession(session.id)!;

      orchestrator.handleTerminalClose(terminal);

      expect(orchestrator.getTerminalForSession(session.id)).toBeUndefined();
      expect(mockSessionRepo.update).toHaveBeenCalledWith(session.id, { status: 'stopped' });
    });
  });

  describe('stopSession', () => {
    it('kills psmux session and marks status stopped', async () => {
      const session = await orchestrator.createTerminal({ taskId: 1, taskSlug: 'x', kind: 'shell' });
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
      const session = await orchestrator.createTerminal({ taskId: 7, taskSlug: 's', kind: 'implement', worktreePath: '/wt/s' });
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
      const session = await orchestrator.createTerminal({ taskId: 7, taskSlug: 's', kind: 'implement', worktreePath: '/wt/s' });
      // Simulate claude_session_id being set externally
      sessions[0].claude_session_id = 'claude-xyz';
      (mockPsmux.sendKeys as any).mockClear();

      await orchestrator.restartSession(session.id);

      const sent = (mockPsmux.sendKeys as any).mock.calls[0][1] as string;
      expect(sent).toContain('-r claude-xyz');
      expect(sent).toContain('cd /wt/s');
    });

    it('does not launch agent on restart for shell kind', async () => {
      const session = await orchestrator.createTerminal({ taskId: 7, taskSlug: 's', kind: 'shell' });
      (mockPsmux.sendKeys as any).mockClear();

      await orchestrator.restartSession(session.id);

      expect(mockPsmux.sendKeys).not.toHaveBeenCalled();
    });
  });
});
