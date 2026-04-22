import vscodeModule, { resetMocks } from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { PsmuxBridge } from '@tackle/shared';
import type { Session, SessionRepository } from '@tackle/shared';
import { TerminalOrchestrator } from '../terminal/terminal-orchestrator';

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
        ...input,
        status: 'running',
        agent: null,
        worktree_path: null,
        claude_session_id: null,
        started_at: new Date().toISOString(),
        ended_at: null,
      } as Session;
      sessions.push(s);
      return s;
    }),
    update: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
  };

  return { sessions, mockPsmux, mockSessionRepo };
}

describe('TerminalOrchestrator', () => {
  let orchestrator: TerminalOrchestrator;
  let mockPsmux: ReturnType<typeof createMocks>['mockPsmux'];
  let mockSessionRepo: SessionRepository;
  let sessions: Session[];

  beforeEach(() => {
    resetMocks();
    const mocks = createMocks();
    mockPsmux = mocks.mockPsmux;
    mockSessionRepo = mocks.mockSessionRepo;
    sessions = mocks.sessions;
    orchestrator = new TerminalOrchestrator(mockSessionRepo, mockPsmux);
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
});
