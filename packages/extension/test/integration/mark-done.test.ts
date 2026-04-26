import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createDatabase, SqliteTaskRepository, SqliteSessionRepository, PsmuxBridge } from '@tackle/shared';
import { setupIntegrationSuite, getContext, waitFor } from './suite-setup';

/**
 * Flow #4 (Mark as Done, #66):
 *   tackle.markSessionDone → SessionActions.markDone:
 *     - orchestrator.stopSession(id)  (kills the psmux session)
 *     - sessions.update(id, { status: 'completed', ended_at: ... })
 *
 * The sidebar render groups completed sessions below the divider; we
 * verify the underlying state (status + psmux absence) since the
 * webview DOM isn't directly inspectable.
 */
suite('Integration: mark done', () => {
  setupIntegrationSuite();

  test('tackle.markSessionDone completes the row and kills its psmux session', async function () {
    this.timeout(60_000);
    const c = getContext();

    const db = createDatabase(c.dbPath);
    const taskRepo = new SqliteTaskRepository(db);
    await taskRepo.upsert({ external_id: '66-d', external_system: 'github', title: 'Task D', description: '', external_status: 'open', assignee: null });
    const tasks = await taskRepo.list();
    db.close();
    const task = tasks[0]!;

    await vscode.commands.executeCommand('tackle.activate');
    await vscode.commands.executeCommand('tackle.activateTask', task.id);

    const newSessionPromise = vscode.commands.executeCommand('tackle.newSession', { taskId: task.id });
    await new Promise((r) => setTimeout(r, 250));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await new Promise((r) => setTimeout(r, 250));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem').then(() => {}, () => {});
    await newSessionPromise;

    const sessionId = await waitFor(async () => {
      const reader = createDatabase(c.dbPath);
      try {
        const row = reader.prepare<{ id: number }>(
          "SELECT id FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
        ).get(task.id);
        return row?.id;
      } finally { reader.close(); }
    }, { timeoutMs: 15_000 }).then(async (ok) => {
      if (!ok) return undefined;
      const reader = createDatabase(c.dbPath);
      try {
        const row = reader.prepare<{ id: number; psmux_name: string }>(
          "SELECT id, psmux_name FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
        ).get(task.id);
        return row;
      } finally { reader.close(); }
    });
    assert.ok(sessionId && typeof sessionId.id === 'number', 'no running session created');
    const psmuxName = sessionId.psmux_name;

    await vscode.commands.executeCommand('tackle.markSessionDone', sessionId.id);

    const completed = await waitFor(async () => {
      const reader = createDatabase(c.dbPath);
      try {
        const row = reader.prepare<{ status: string; ended_at: string | null }>(
          'SELECT status, ended_at FROM sessions WHERE id = ?',
        ).get(sessionId.id);
        return row?.status === 'completed' && !!row?.ended_at;
      } finally { reader.close(); }
    }, { timeoutMs: 10_000 });
    assert.ok(completed, 'session not marked completed');

    // psmux session for this row should be gone.
    const psmux = new PsmuxBridge();
    const stillAlive = await waitFor(() => !psmux.hasSession(psmuxName), { timeoutMs: 10_000 });
    assert.ok(stillAlive, `psmux session ${psmuxName} still alive after markDone`);
  });
});
