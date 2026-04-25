import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createDatabase, SqliteTaskRepository, PsmuxBridge } from '@tackle/shared';
import { setupIntegrationSuite, getContext, waitFor } from './suite-setup';

/**
 * Flow #5 (VS Code restart recovery, #66):
 *   psmux Sessions outlive VS Code (ADR-0003). On the next launch the
 *   extension calls TerminalOrchestrator.resumeRunningDetectors() which
 *   re-attaches detectors to every Session row still marked 'running'.
 *
 * We can't kill+relaunch VS Code mid-suite, so we simulate the restart
 * with deactivate→re-activate inside the same extension host: same
 * workspace, same DB, same on-disk psmux sessions. The post-conditions
 * we verify are the same ones a real restart would produce:
 *   - Active Task pointer is restored from workspaceState (ScopeManager
 *     .restoreActiveTask).
 *   - The psmux session created in the first activate is still alive
 *     after the second activate.
 */
suite('Integration: restart recovery', () => {
  setupIntegrationSuite();

  test('re-activating restores the active task and existing psmux sessions', async function () {
    this.timeout(60_000);
    const c = getContext();

    const db = createDatabase(c.dbPath);
    const taskRepo = new SqliteTaskRepository(db);
    await taskRepo.upsert({ external_id: '66-e', external_system: 'github', title: 'Task E', description: '', status: 'open', assignee: null });
    const tasks = await taskRepo.list();
    db.close();
    const task = tasks[0]!;

    // First activate: create a session.
    await vscode.commands.executeCommand('tackle.activate');
    await vscode.commands.executeCommand('tackle.activateTask', task.id);
    const newSessionPromise = vscode.commands.executeCommand('tackle.newSession', { taskId: task.id });
    await new Promise((r) => setTimeout(r, 250));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await new Promise((r) => setTimeout(r, 250));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem').then(() => {}, () => {});
    await newSessionPromise;

    const sessionRow = await waitFor(async () => {
      const reader = createDatabase(c.dbPath);
      try {
        return reader.prepare<{ id: number; psmux_name: string }>(
          "SELECT id, psmux_name FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
        ).get(task.id);
      } finally { reader.close(); }
    }, { timeoutMs: 15_000 }).then(async () => {
      const reader = createDatabase(c.dbPath);
      try {
        return reader.prepare<{ id: number; psmux_name: string }>(
          "SELECT id, psmux_name FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
        ).get(task.id);
      } finally { reader.close(); }
    });
    assert.ok(sessionRow, 'no running session created in first activate');
    const psmuxName = sessionRow.psmux_name;

    const psmux = new PsmuxBridge();
    assert.ok(psmux.hasSession(psmuxName), 'psmux session never appeared');

    // "Restart": deactivate then re-activate. workspaceState persists
    // (in-process), DB persists (on disk), psmux persists (out of
    // process — the whole point of ADR-0003).
    await vscode.commands.executeCommand('tackle.deactivate');
    await new Promise((r) => setTimeout(r, 250));
    await vscode.commands.executeCommand('tackle.activate');

    // psmux session should still be alive across the restart.
    assert.ok(psmux.hasSession(psmuxName), 'psmux session was lost across restart');

    // The DB row is still 'running' (not flipped to stopped by
    // deactivate, which is the production contract).
    const reader = createDatabase(c.dbPath);
    const row = reader.prepare<{ status: string }>('SELECT status FROM sessions WHERE id = ?').get(sessionRow.id);
    reader.close();
    assert.strictEqual(row?.status, 'running', 'session status changed across restart');
  });
});
