import * as vscode from 'vscode';
import { ModeManager } from './mode';
import { SqliteTaskRepository, SqliteSessionRepository, SqliteLayoutStateRepository, PsmuxBridge } from '@tackle/shared';
import type { SessionKind } from '@tackle/shared';
import { TaskService } from './task';
import { TerminalOrchestrator } from './terminal';
import { WorktreeProvisioner } from './worktree';
import { createVscodeAgentRegistry } from './agent';
import { SessionActions, ObservableSessionRepository, NewSessionFlow } from './session';
import { LayoutManager } from './layout';
import { ScopeManager } from './scope';
import { SidebarController, SidebarViewProvider } from './sidebar';
import { checkSingleRootWorkspace, ensureTackleDir } from './guards';
import { runLatencyBenchmark, formatResult } from './bench';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Tackle: extension activate() called');
  const modeManager = new ModeManager(context);
  let taskService: TaskService | undefined;
  let terminalOrchestrator: TerminalOrchestrator | undefined;
  let sessionRepoRef: ObservableSessionRepository | undefined;
  let sessionActions: SessionActions | undefined;
  let scopeManager: ScopeManager | undefined;
  let sidebarController: SidebarController | undefined;

  // Placeholder task repo for the sidebar until activation fills it in.
  const placeholderTaskRepo = { list: async () => [], get: async () => undefined, upsert: async () => {}, upsertBatch: async () => {} };

  // The sidebar needs a scope-like object even before activation; build a stub
  // that the real ScopeManager replaces on activation.
  const scopeStub = {
    getActiveTaskId: () => undefined,
    onDidChangeActiveTask: (_listener: (id: number | undefined) => void) => ({ dispose: () => {} }),
  };

  sidebarController = new SidebarController({
    taskRepo: placeholderTaskRepo,
    scope: scopeStub,
    workspaceState: context.workspaceState,
    executeCommand: (cmd, ...args) => Promise.resolve(vscode.commands.executeCommand(cmd, ...args)),
  });
  void sidebarController.start();

  const sidebarProvider = new SidebarViewProvider(context.extensionUri, sidebarController);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const activateCmd = vscode.commands.registerCommand('tackle.activate', async () => {
    console.log('Tackle: tackle.activate command fired');
    try {
      const folders = vscode.workspace.workspaceFolders;
      console.log('Tackle: workspaceFolders =', folders?.map(f => f.uri.fsPath));
      if (!await checkSingleRootWorkspace()) {
        console.log('Tackle: workspace check failed');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
      await ensureTackleDir(workspaceRoot);
      await modeManager.activate();

      const db = modeManager.getDatabase();
      if (!db) {
        vscode.window.showErrorMessage('Tackle: Failed to initialize database.');
        return;
      }

      const taskRepo = new SqliteTaskRepository(db);
      const baseSessionRepo = new SqliteSessionRepository(db);
      const sessionRepo = new ObservableSessionRepository(baseSessionRepo);
      const layoutRepo = new SqliteLayoutStateRepository(db);
      const psmux = new PsmuxBridge();

      taskService = new TaskService(taskRepo);
      const worktreeProvisioner = new WorktreeProvisioner({
        workspaceRoot,
        taskRepo,
      });
      terminalOrchestrator = new TerminalOrchestrator(sessionRepo, psmux, createVscodeAgentRegistry(), {
        ensureForTask: async (taskId: number) => {
          const task = await taskRepo.get(taskId);
          if (!task) throw new Error(`Task ${taskId} not found`);
          return worktreeProvisioner.ensureWorktreeForTask(task);
        },
      });

      sessionRepoRef = sessionRepo;
      sessionActions = new SessionActions({
        sessions: sessionRepo,
        orchestrator: terminalOrchestrator,
        confirm: async (msg: string) => {
          const pick = await vscode.window.showWarningMessage(msg, { modal: true }, 'Remove');
          return pick === 'Remove';
        },
      });

      const layoutManager = new LayoutManager(layoutRepo);
      scopeManager = new ScopeManager({
        terminalOrchestrator,
        layoutManager,
        workspaceState: context.workspaceState,
      });

      const prevController = sidebarController;
      sidebarController = new SidebarController({
        taskRepo,
        sessionRepo,
        scope: scopeManager,
        workspaceState: context.workspaceState,
        executeCommand: (cmd, ...args) => Promise.resolve(vscode.commands.executeCommand(cmd, ...args)),
      });
      await sidebarController.start();
      sidebarProvider.setController(sidebarController);
      prevController?.dispose();

      scopeManager.restoreActiveTask();

      context.subscriptions.push(
        vscode.window.onDidCloseTerminal((t) => {
          terminalOrchestrator?.handleTerminalClose(t);
        }),
      );

      vscode.window.showInformationMessage('Tackle activated!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      vscode.window.showErrorMessage(`Tackle activation failed: ${message}`);
      console.error('Tackle activation error:', err);
    }
  });

  const deactivateCmd = vscode.commands.registerCommand('tackle.deactivate', () => {
    terminalOrchestrator?.disposeAll();
    return modeManager.deactivate();
  });

  const syncTasksCmd = vscode.commands.registerCommand('tackle.syncTasks', async () => {
    if (!taskService) {
      vscode.window.showErrorMessage('Tackle must be activated before syncing tasks.');
      return;
    }
    try {
      const count = await taskService.syncFromGitHub();
      await sidebarController?.refresh();
      vscode.window.showInformationMessage(`Synced ${count} tasks from GitHub.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to sync tasks: ${message}`);
    }
  });

  const activateTaskCmd = vscode.commands.registerCommand('tackle.activateTask', async (taskId: number) => {
    if (!scopeManager) return;
    await scopeManager.switchTask(taskId);
    await vscode.commands.executeCommand('setContext', 'tackle.activeTaskId', taskId);
  });

  const focusSessionCmd = vscode.commands.registerCommand('tackle.focusSession', async (sessionId: number) => {
    if (!terminalOrchestrator) return;
    const existing = terminalOrchestrator.getTerminalForSession(sessionId);
    if (existing) {
      existing.show();
      return;
    }
    try {
      await terminalOrchestrator.reattachSession(sessionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to reattach session: ${message}`);
    }
  });

  const newSessionCmd = vscode.commands.registerCommand('tackle.newSession', async (arg?: { taskId?: number }) => {
    if (!terminalOrchestrator || !scopeManager || !sessionRepoRef) {
      vscode.window.showErrorMessage('Tackle must be activated first.');
      return;
    }
    const targetTaskId = arg?.taskId ?? scopeManager.getActiveTaskId();
    if (targetTaskId === undefined) {
      vscode.window.showErrorMessage('No active task. Select a task in the Tackle sidebar first.');
      return;
    }

    const flow = new NewSessionFlow({
      sessions: sessionRepoRef,
      orchestrator: terminalOrchestrator,
      scope: scopeManager,
      pickKind: async () =>
        (await vscode.window.showQuickPick(
          ['plan', 'implement', 'review', 'debug', 'test', 'pilot', 'shell'],
          { placeHolder: 'Session kind' },
        )) as SessionKind | undefined,
    });

    try {
      const created = await flow.start(targetTaskId);
      if (created) {
        const term = terminalOrchestrator.getTerminalForSession(created.id);
        term?.show();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to create session: ${message}`);
    }
  });

  context.subscriptions.push(activateCmd, deactivateCmd, syncTasksCmd, activateTaskCmd, focusSessionCmd, newSessionCmd);

  async function pickSessionId(placeHolder: string): Promise<number | undefined> {
    if (!sessionRepoRef) {
      vscode.window.showErrorMessage('Tackle must be activated first.');
      return undefined;
    }
    const sessions = await sessionRepoRef.list();
    const visible = sessions.filter((s) => !s.deleted_at);
    if (visible.length === 0) {
      vscode.window.showInformationMessage('No sessions available.');
      return undefined;
    }
    const items = visible.map((s) => ({
      label: s.tab_label || s.name,
      description: `#${s.id} · ${s.status}`,
      id: s.id,
    }));
    const pick = await vscode.window.showQuickPick(items, { placeHolder });
    return pick?.id;
  }

  async function resolveId(arg: unknown, placeHolder: string): Promise<number | undefined> {
    if (typeof arg === 'number') return arg;
    if (arg && typeof arg === 'object' && 'id' in (arg as any) && typeof (arg as any).id === 'number') {
      return (arg as any).id;
    }
    return pickSessionId(placeHolder);
  }

  function ensureActions(): SessionActions | undefined {
    if (!sessionActions) {
      vscode.window.showErrorMessage('Tackle must be activated first.');
      return undefined;
    }
    return sessionActions;
  }

  const stopSessionCmd = vscode.commands.registerCommand('tackle.stopSession', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to stop'); if (id === undefined) return;
    await actions.stop(id);
  });

  const restartSessionCmd = vscode.commands.registerCommand('tackle.restartSession', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to restart'); if (id === undefined) return;
    await actions.restart(id);
  });

  const removeSessionCmd = vscode.commands.registerCommand('tackle.removeSession', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to remove'); if (id === undefined) return;
    await actions.remove(id);
  });

  const markSessionDoneCmd = vscode.commands.registerCommand('tackle.markSessionDone', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to mark done'); if (id === undefined) return;
    await actions.markDone(id);
  });

  const renameSessionCmd = vscode.commands.registerCommand(
    'tackle.renameSession',
    async (arg?: unknown, newLabelArg?: string) => {
      const actions = ensureActions(); if (!actions) return;
      const id = await resolveId(arg, 'Select a session to rename'); if (id === undefined) return;
      let label = newLabelArg;
      if (!label) {
        const current = await sessionRepoRef?.get(id);
        label = await vscode.window.showInputBox({
          prompt: 'New session label',
          value: current?.tab_label ?? '',
        });
        if (!label) return;
      }
      await actions.rename(id, label);
    },
  );

  context.subscriptions.push(
    stopSessionCmd,
    restartSessionCmd,
    removeSessionCmd,
    markSessionDoneCmd,
    renameSessionCmd,
  );

  const benchCmd = vscode.commands.registerCommand('tackle.benchmark', async () => {
    const out = vscode.window.createOutputChannel('Tackle Bench');
    out.show(true);
    out.appendLine('Running latency benchmark (this takes ~30s)...');
    try {
      const psmux = new PsmuxBridge();
      const iterations = 20;
      const result = await runLatencyBenchmark(psmux, iterations);
      out.appendLine('');
      out.appendLine(formatResult(result));
      out.appendLine('');
      out.appendLine('Raw samples:');
      for (const s of result.samples) {
        out.appendLine(`  ${s.method.padEnd(18)} iter=${s.iteration}  ${s.latencyMs.toFixed(1)}ms`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      out.appendLine(`\nBenchmark failed: ${message}`);
    }
  });
  context.subscriptions.push(benchCmd);
}

export function deactivate(): void {}
