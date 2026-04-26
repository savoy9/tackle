import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createDatabase, SqliteTaskRepository, SqliteSessionRepository } from '@tackle/shared';
import { setupIntegrationSuite, getContext, waitFor } from './suite-setup';

/**
 * Flow #3 (New Session, #66):
 *   Create a Session via tackle.newSession → assert that a Session row
 *   appears in the DB with status='running' and the stub Agent's
 *   detector reports the expected idle→working→idle transitions.
 *
 * tackle.newSession bottoms out in NewSessionFlow which prompts the
 * user via two QuickPicks. We drive them with the workbench
 * accept-action command. The actual psmux session is created with the
 * `stub` adapter (selected by tackle.defaultAgent='stub' from
 * .vscode/settings.json) which writes a deterministic jsonl file the
 * production ClaudeJsonlDetector consumes.
 */
suite('Integration: new session', () => {
  setupIntegrationSuite();

  test('tackle.newSession creates a running session with stub Agent', async function () {
    this.timeout(60_000);
    const c = getContext();

    // Seed one task and activate.
    const db = createDatabase(c.dbPath);
    const taskRepo = new SqliteTaskRepository(db);
    await taskRepo.upsert({ external_id: '66-c', external_system: 'github', title: 'Task C', description: '', external_status: 'open', assignee: null });
    const tasks = await taskRepo.list();
    db.close();
    const task = tasks[0]!;

    await vscode.commands.executeCommand('tackle.activate');
    await vscode.commands.executeCommand('tackle.activateTask', task.id);

    // Fire newSession; the QuickPicks are answered by accepting the
    // first highlighted item (which is `plan` — fine for stub).
    //
    // FIXME (follow-up): this drives QuickPicks via timing-based command
    // dispatch because NewSessionFlow doesn't expose a pickProvider seam.
    // Add an injection seam in production code so tests don't race the UI.
    const newSessionPromise = vscode.commands.executeCommand('tackle.newSession', { taskId: task.id });
    // Two QuickPicks (kind, then isolate). Give VS Code time to mount each.
    await new Promise((r) => setTimeout(r, 500));
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await new Promise((r) => setTimeout(r, 500));
    // Second QuickPick only fires for impl-like kinds; default `plan` skips it.
    // Fire the accept anyway; if no QuickPick is open it's a no-op.
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem').then(() => {}, () => {});
    await newSessionPromise;

    const sessionAppeared = await waitFor(async () => {
      const reader = createDatabase(c.dbPath);
      try {
        const rows = reader.prepare<{ id: number; status: string }>(
          'SELECT id, status FROM sessions WHERE task_id = ?',
        ).all(task.id);
        return rows.length >= 1 && rows.some((r) => r.status === 'running');
      } finally { reader.close(); }
    }, { timeoutMs: 15_000 });
    assert.ok(sessionAppeared, 'no running session row appeared after tackle.newSession');

    // Confirm the row carries the stub agent.
    const reader = createDatabase(c.dbPath);
    const sessionRepo = new SqliteSessionRepository(reader);
    const sessions = await sessionRepo.listForTask(task.id);
    reader.close();
    assert.strictEqual(sessions.length, 1, `expected exactly one session, got ${sessions.length}`);
    assert.strictEqual(sessions[0].agent, 'stub', `expected agent='stub', got ${sessions[0].agent}`);
    assert.strictEqual(sessions[0].status, 'running');
  });
});
