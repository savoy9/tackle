import * as vscode from 'vscode';
import { ModeManager } from './mode';
import { SqliteTaskRepository, SqliteSessionRepository, SqliteLayoutStateRepository, PsmuxBridge } from '@tackle/shared';
import { TaskService, TaskTreeProvider } from './task';
import { TerminalOrchestrator } from './terminal';
import { SessionTreeProvider } from './session';
import { LayoutManager } from './layout';
import { ScopeManager } from './scope';
import { checkSingleRootWorkspace, ensureTackleDir } from './guards';
import { runLatencyBenchmark, formatResult } from './bench';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Tackle: extension activate() called');
  const modeManager = new ModeManager(context);
  let taskService: TaskService | undefined;
  let terminalOrchestrator: TerminalOrchestrator | undefined;
  let scopeManager: ScopeManager | undefined;

  // Register tree views immediately so VS Code doesn't show "no data provider"
  const taskTreeProvider = new TaskTreeProvider({ list: async () => [], get: async () => undefined, upsert: async () => {}, upsertBatch: async () => {} });
  const sessionTreeProvider = new SessionTreeProvider({ list: async () => [], get: async () => undefined, listForTask: async () => [], create: async () => ({} as any), update: async () => {}, complete: async () => {} }, () => false);

  vscode.window.createTreeView('tackleTaskView', { treeDataProvider: taskTreeProvider });
  vscode.window.createTreeView('tackleSessionView', { treeDataProvider: sessionTreeProvider });

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

      taskTreeProvider.setRepository(taskRepo);
      sessionTreeProvider.setRepository(sessionRepo);

      taskService = new TaskService(taskRepo);
      terminalOrchestrator = new TerminalOrchestrator(sessionRepo, psmux);
      sessionTreeProvider.setHasTerminalFn((id) => terminalOrchestrator!.getTerminalForSession(id) !== undefined);

      const layoutManager = new LayoutManager(layoutRepo);
      scopeManager = new ScopeManager({
        terminalOrchestrator,
        taskTreeProvider,
        sessionTreeProvider,
        layoutManager,
      });

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
      taskTreeProvider.refresh();
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
    // Detached: reattach by session id
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

    const task = await taskTreeProvider.getTask(activeTaskId);
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
