import * as vscode from 'vscode';
import { ModeManager } from './mode';
import { SqliteTaskRepository, SqliteSessionRepository, SqliteLayoutStateRepository, PsmuxBridge } from '@tackle/shared';
import { TaskService } from './task';
import { TerminalOrchestrator } from './terminal';
import { createVscodeAgentRegistry } from './agent';
import { SessionTreeProvider, SessionActions } from './session';
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
  let sessionRepoRef: import('@tackle/shared').SessionRepository | undefined;
  let sessionActions: SessionActions | undefined;
  let scopeManager: ScopeManager | undefined;
  let sidebarController: SidebarController | undefined;

  // Placeholder session tree provider so VS Code has a data provider immediately.
  const sessionTreeProvider = new SessionTreeProvider({ list: async () => [], get: async () => undefined, listForTask: async () => [], create: async () => ({} as any), update: async () => {}, complete: async () => {}, softDelete: async () => {} }, () => false);
  vscode.window.createTreeView('tackleSessionView', { treeDataProvider: sessionTreeProvider });

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
  });
  // Best-effort initial render with empty state.
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
      const sessionRepo = new SqliteSessionRepository(db);
      const layoutRepo = new SqliteLayoutStateRepository(db);
      const psmux = new PsmuxBridge();

      sessionTreeProvider.setRepository(sessionRepo);

      taskService = new TaskService(taskRepo);
      terminalOrchestrator = new TerminalOrchestrator(sessionRepo, psmux, createVscodeAgentRegistry());
      sessionTreeProvider.setHasTerminalFn((id) => terminalOrchestrator!.getTerminalForSession(id) !== undefined);

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
        sessionTreeProvider,
        layoutManager,
        workspaceState: context.workspaceState,
      });

      // Rebuild controller with live deps.
      const prevController = sidebarController;
      sidebarController = new SidebarController({
        taskRepo,
        scope: scopeManager,
        workspaceState: context.workspaceState,
      });
      await sidebarController.start();
      // Swap the webview poster onto the new controller.
      sidebarProvider.setController(sidebarController);
      prevController?.dispose();

      scopeManager.restoreActiveTask();

      context.subscriptions.push(
        vscode.window.onDidCloseTerminal((t) => terminalOrchestrator?.handleTerminalClose(t)),
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

  const selectTaskCmd = vscode.commands.registerCommand('tackle.selectTask', async (taskId: number) => {
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
      sessionTreeProvider.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to reattach session: ${message}`);
    }
  });

  const newSessionCmd = vscode.commands.registerCommand('tackle.newSession', async () => {
    if (!terminalOrchestrator || !scopeManager) {
      vscode.window.showErrorMessage('Tackle must be activated first.');
      return;
    }
    const activeTaskId = scopeManager.getActiveTaskId();
    if (activeTaskId === undefined) {
      vscode.window.showErrorMessage('Select a task in the Tackle sidebar first.');
      return;
    }

    const kind = await vscode.window.showQuickPick(
      ['pilot', 'implement', 'plan', 'review', 'debug', 'test', 'shell'],
      { placeHolder: 'Session kind' },
    );
    if (!kind) return;

    const task = sidebarController?.getState().tasks.find((t) => t.id === activeTaskId);
    const slug = (task?.title ?? 'task')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);

    try {
      await terminalOrchestrator.createTerminal({
        taskId: activeTaskId,
        taskSlug: slug,
        kind: kind as any,
      });
      sessionTreeProvider.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to create session: ${message}`);
    }
  });

  context.subscriptions.push(activateCmd, deactivateCmd, syncTasksCmd, selectTaskCmd, focusSessionCmd, newSessionCmd);

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
    sessionTreeProvider.refresh();
  });

  const restartSessionCmd = vscode.commands.registerCommand('tackle.restartSession', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to restart'); if (id === undefined) return;
    await actions.restart(id);
    sessionTreeProvider.refresh();
  });

  const removeSessionCmd = vscode.commands.registerCommand('tackle.removeSession', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to remove'); if (id === undefined) return;
    await actions.remove(id);
    sessionTreeProvider.refresh();
  });

  const markSessionDoneCmd = vscode.commands.registerCommand('tackle.markSessionDone', async (arg?: unknown) => {
    const actions = ensureActions(); if (!actions) return;
    const id = await resolveId(arg, 'Select a session to mark done'); if (id === undefined) return;
    await actions.markDone(id);
    sessionTreeProvider.refresh();
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
      sessionTreeProvider.refresh();
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
