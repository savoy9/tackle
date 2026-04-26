import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { setupIntegrationSuite, getContext } from './suite-setup';

suite('Integration: smoke', () => {
  setupIntegrationSuite();

  test('VS Code is reachable and fixture workspace is mounted', () => {
    assert.ok(vscode.window, 'vscode.window missing');
    const c = getContext();
    assert.ok(fs.existsSync(c.workspaceDir), 'workspace dir missing');
    assert.ok(fs.existsSync(c.tackleDir), '.tackle dir missing');
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, 'no workspace folders');
    assert.strictEqual(
      folders[0].uri.fsPath.toLowerCase(),
      c.workspaceDir.toLowerCase(),
      'fixture workspace not active',
    );
  });
});
