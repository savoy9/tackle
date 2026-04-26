import * as vscode from 'vscode';
import { ModeManager } from './mode';
import {
  SqliteTaskRepository,
  SqliteSessionRepository,
  SqliteLayoutStateRepository,
  PsmuxBridge,
} from '@tackle/shared';
import { TaskService, TaskRemover, type RemovePromptFn } from './task';
import { TerminalOrchestrator } from './terminal';
import { WorktreeProvisioner, createVscodeWorktreeConfigReader } from './worktree';
import { createVscodeAgentRegistry } from './agent';
import {
  SessionActions,
  ObservableSessionRepository,
  NewSessionFlow,
  buildKindQuickPickItems,
} from './session';
import { LayoutManager } from './layout';
import { ScopeManager } from './scope';
import { SidebarController, SidebarViewProvider } from './sidebar';
import { checkSingleRootWorkspace, ensureTackleDir, resolveWorkspaceRoot } from './guards';
import { runLatencyBenchmark, formatResult } from './bench';

// Module-level reference so `deactivate()` can release detectors and
// terminal handles cleanly when VS Code shuts down. Set inside
// `activate()` once the orchestrator is constructed.
let activeOrchestrator: TerminalOrchestrator | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('Tackle: extension activate() called');
  const modeManager = new ModeManager(context);
  let taskService: TaskService | undefined;
  let terminalOrchestrator: TerminalOrchestrator | undefined;
  let sessionRepoRef: ObservableSessionRepository | undefined;
  let sessionActions: SessionActions | undefined;
  let scopeManager: ScopeManager | undefined;
  let sidebarController: SidebarController | undefined;
  let taskRemover: TaskRemover | undefined;
  let taskRepoRef: SqliteTaskRepository | undefined;
  let worktreeProvisionerRef: WorktreeProvisioner | undefined;

  // Placeholder task repo for the sidebar until activation fills it in.
  const placeholderTaskRepo = {
    list: async () => [],
    get: async () => undefined,
    upsert: async () => {},
    upsertBatch: async () => {},
    setWorktree: async () => {},
  };

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
    colorTheme: vscode.window,
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
      console.log(
        'Tackle: workspaceFolders =',
        folders?.map((f) => f.uri.fsPath),
      );
      if (!(await checkSingleRootWorkspace())) {
        console.log('Tackle: workspace check failed');
        return;
      }

      const workspaceRoot = resolveWorkspaceRoot()!;
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
        configReader: createVscodeWorktreeConfigReader((section) =>
          vscode.workspace.getConfiguration(section),
        ),
      });
      taskRepoRef = taskRepo;
      worktreeProvisionerRef = worktreeProvisioner;
      terminalOrchestrator = new TerminalOrchestrator(
        sessionRepo,
        psmux,
        createVscodeAgentRegistry(),
        {
          ensureForTask: async (taskId: number) => {
            const task = await taskRepo.get(taskId);
            if (!task) throw new Error(`Task ${taskId} not found`);
            return worktreeProvisioner.ensureWorktreeForTask(task);
          },
        },
      );
      activeOrchestrator = terminalOrchestrator;

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

      const removePrompt: RemovePromptFn = async (task, cleanliness) => {
        const summary = cleanliness.clean
          ? 'The worktree is clean (no uncommitted changes, nothing ahead of base).'
          : `The worktree is dirty: ${cleanliness.reason}.`;
        const message = `Remove worktree for task "${task.title}" at ${task.worktree_path}?\n\n${summary}`;
        const defaultRemove = cleanliness.clean;
        // Modal preselects the first action; order matches the safe default.
        const items: string[] = defaultRemove
          ? ['Remove worktree', 'Keep worktree']
          : ['Keep worktree', 'Remove worktree'];
        const pick = await vscode.window.showWarningMessage(message, { modal: true }, ...items);
        const remove = pick === 'Remove worktree';
        return { remove, force: remove && !cleanliness.clean };
      };
      taskRemover = new TaskRemover({ taskRepo, prompt: removePrompt, workspaceRoot });
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
        executeCommand: (cmd, ...args) =>
          Promise.resolve(vscode.commands.executeCommand(cmd, ...args)),
        colorTheme: vscode.window,
        isActivated: true,
      });
      await sidebarController.start();
      sidebarProvider.setController(sidebarController);
      prevController?.dispose();

      scopeManager.restoreActiveTask();

      // Re-attach detectors to any Session rows still marked `running`
      // (psmux survives VS Code restarts per ADR-0003). Fire-and-forget so
      // activation isn't blocked by file reads for every running session.
      terminalOrchestrator.resumeRunningDetectors().catch((err) => {
        console.error('Tackle: resumeRunningDetectors failed', err);
      });

      context.subscriptions.push(
        vscode.window.onDidCloseTerminal((t) => {
          terminalOrchestrator?.handleTerminalClose(t);
        }),
      );

      vscode.window.showInformationMessage('Tackle activated!');
    } catch (err: unknown) {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
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

  const activateTaskCmd = vscode.commands.registerCommand(
    'tackle.activateTask',
    async (taskId: number) => {
      if (!scopeManager) return;
      await scopeManager.switchTask(taskId);
      await vscode.commands.executeCommand('setContext', 'tackle.activeTaskId', taskId);
    },
  );

  const focusSessionCmd = vscode.commands.registerCommand(
    'tackle.focusSession',
    async (sessionId: number) => {
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
    },
  );

  const newSessionCmd = vscode.commands.registerCommand(
    'tackle.newSession',
    async (arg?: { taskId?: number }) => {
      if (!terminalOrchestrator || !scopeManager || !sessionRepoRef) {
        vscode.window.showErrorMessage('Tackle must be activated first.');
        return;
      }
      const targetTaskId = arg?.taskId ?? scopeManager.getActiveTaskId();
      if (targetTaskId === undefined) {
        vscode.window.showErrorMessage(
          'No active task. Select a task in the Tackle sidebar first.',
        );
        return;
      }

      const flow = new NewSessionFlow({
        sessions: sessionRepoRef,
        orchestrator: terminalOrchestrator,
        scope: scopeManager,
        pickKind: async () => {
          const items = buildKindQuickPickItems();
          const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Session kind' });
          return picked?.sessionKind;
        },
        pickIsolate: async (kind) => {
          const picked = await vscode.window.showQuickPick(
            [
              {
                label: 'Share Task worktree',
                description: "Default — siblings see each other's edits",
                isolate: false,
              },
              {
                label: '✂️  Isolate in new worktree',
                description: `Spawn ${kind} in a parallel sub-worktree`,
                isolate: true,
              },
            ],
            { placeHolder: 'Worktree isolation' },
          );
          return picked?.isolate;
        },
        taskRepo: taskRepoRef,
        worktreeProvisioner: worktreeProvisionerRef,
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
    },
  );

  context.subscriptions.push(
    activateCmd,
    deactivateCmd,
    syncTasksCmd,
    activateTaskCmd,
    focusSessionCmd,
    newSessionCmd,
  );

  const removeTaskCmd = vscode.commands.registerCommand(
    'tackle.removeTask',
    async (arg?: unknown) => {
      if (!taskRemover) {
        vscode.window.showErrorMessage('Tackle must be activated first.');
        return;
      }
      const taskId = extractTaskId(arg);
      if (taskId === undefined) {
        vscode.window.showErrorMessage('Tackle: removeTask requires a task id.');
        return;
      }
      try {
        const result = await taskRemover.removeTask(taskId);
        if (result.worktreeRemoved) {
          await sidebarController?.refresh();
          vscode.window.showInformationMessage('Tackle: worktree removed.');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Tackle: failed to remove task worktree: ${message}`);
      }
    },
  );
  context.subscriptions.push(removeTaskCmd);

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
    if (
      arg &&
      typeof arg === 'object' &&
      'id' in (arg as any) &&
      typeof (arg as any).id === 'number'
    ) {
      return (arg as any).id;
    }
    return pickSessionId(placeHolder);
  }

  /**
   * Narrow a command argument to a task id. VS Code may pass a raw number,
   * a webview message shaped as `{ taskId }`, or a sidebar row object
   * shaped as `{ id }`. Returns undefined when no recognizable id is
   * present — the caller is responsible for user-facing error messaging.
   */
  function extractTaskId(arg: unknown): number | undefined {
    if (typeof arg === 'number') return arg;
    if (arg && typeof arg === 'object') {
      const obj = arg as Record<string, unknown>;
      if (typeof obj.taskId === 'number') return obj.taskId;
      if (typeof obj.id === 'number') return obj.id;
    }
    return undefined;
  }

  function ensureActions(): SessionActions | undefined {
    if (!sessionActions) {
      vscode.window.showErrorMessage('Tackle must be activated first.');
      return undefined;
    }
    return sessionActions;
  }

  const stopSessionCmd = vscode.commands.registerCommand(
    'tackle.stopSession',
    async (arg?: unknown) => {
      const actions = ensureActions();
      if (!actions) return;
      const id = await resolveId(arg, 'Select a session to stop');
      if (id === undefined) return;
      await actions.stop(id);
    },
  );

  const restartSessionCmd = vscode.commands.registerCommand(
    'tackle.restartSession',
    async (arg?: unknown) => {
      const actions = ensureActions();
      if (!actions) return;
      const id = await resolveId(arg, 'Select a session to restart');
      if (id === undefined) return;
      await actions.restart(id);
    },
  );

  const removeSessionCmd = vscode.commands.registerCommand(
    'tackle.removeSession',
    async (arg?: unknown) => {
      const actions = ensureActions();
      if (!actions) return;
      const id = await resolveId(arg, 'Select a session to remove');
      if (id === undefined) return;
      await actions.remove(id);
    },
  );

  const markSessionDoneCmd = vscode.commands.registerCommand(
    'tackle.markSessionDone',
    async (arg?: unknown) => {
      const actions = ensureActions();
      if (!actions) return;
      const id = await resolveId(arg, 'Select a session to mark done');
      if (id === undefined) return;
      await actions.markDone(id);
    },
  );

  const renameSessionCmd = vscode.commands.registerCommand(
    'tackle.renameSession',
    async (arg?: unknown, newLabelArg?: string) => {
      const actions = ensureActions();
      if (!actions) return;
      const id = await resolveId(arg, 'Select a session to rename');
      if (id === undefined) return;
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
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      out.appendLine(`\nBenchmark failed: ${message}`);
    }
  });
  context.subscriptions.push(benchCmd);

  // ---------------------------------------------------------------------
  // Perf shims (test-only, gated on TACKLE_TEST_STUB_PATH).
  //
  // The perf scenarios in `test/perf/scenarios.ts` need a deterministic,
  // QuickPick-free way to seed tasks and spawn sessions so the timing
  // harness measures the activate-task path, not human interaction. We
  // wire two internal commands here:
  //
  //   tackle._perfSeedTask(title)             → returns numeric task id
  //   tackle._perfSpawnSession({ taskId, kind: 'agent' | 'shell' })
  //
  // They're registered only when the harness env var is set, matching
  // the `stub` agent's gating in `agent-registry.ts`. Production builds
  // never see these commands.
  // ---------------------------------------------------------------------
  if (process.env.TACKLE_TEST_STUB_PATH) {
    const ensureActivated = async (): Promise<void> => {
      if (!taskRepoRef || !terminalOrchestrator) {
        await vscode.commands.executeCommand('tackle.activate');
      }
    };

    const perfSeedTaskCmd = vscode.commands.registerCommand(
      'tackle._perfSeedTask',
      async (title: string): Promise<number> => {
        await ensureActivated();
        if (!taskRepoRef) {
          throw new Error('tackle._perfSeedTask: task repo unavailable after activate.');
        }
        // External_id must be safe for git branch names (the worktree
        // provisioner builds a branch from it). Avoid `:` and other
        // refspec metacharacters; the title is already deterministic.
        const externalId = `perf-${title}`;
        await taskRepoRef.upsert({
          external_id: externalId,
          external_system: 'github',
          title,
          description: '',
          status: 'open',
          assignee: null,
        });
        const all = await taskRepoRef.list();
        const found = all.find((t) => t.external_id === externalId);
        if (!found) {
          throw new Error(`tackle._perfSeedTask: row missing after upsert (${externalId}).`);
        }
        await sidebarController?.refresh();
        return found.id;
      },
    );

    const perfSpawnSessionCmd = vscode.commands.registerCommand(
      'tackle._perfSpawnSession',
      async (arg: { taskId: number; kind: 'agent' | 'shell' }): Promise<void> => {
        await ensureActivated();
        if (!terminalOrchestrator || !taskRepoRef) {
          throw new Error('tackle._perfSpawnSession: orchestrator unavailable after activate.');
        }
        const task = await taskRepoRef.get(arg.taskId);
        if (!task) {
          throw new Error(`tackle._perfSpawnSession: unknown taskId ${arg.taskId}.`);
        }
        // Map the harness-level kind to a real SessionKind. 'agent' picks
        // 'implement' (any non-shell kind triggers the agent launch via
        // AgentRegistry.shouldLaunch).
        const kind = arg.kind === 'shell' ? 'shell' : 'implement';
        // Slug is a label component (psmux tab label only); derive a
        // safe-ish one from the task title.
        const slug =
          task.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'task';
        await terminalOrchestrator.createTerminal({
          taskId: task.id,
          taskSlug: slug,
          kind,
          source: 'perf',
          agent: 'stub',
        });
      },
    );

    context.subscriptions.push(perfSeedTaskCmd, perfSpawnSessionCmd);
  }
}

export function deactivate(): void {
  // Release detectors (file watchers, polling timers) and terminals so
  // VS Code shutdown is clean — psmux sessions stay alive on disk and
  // get re-attached on next activation via `resumeRunningDetectors`.
  activeOrchestrator?.disposeAll();
  activeOrchestrator = undefined;
}
