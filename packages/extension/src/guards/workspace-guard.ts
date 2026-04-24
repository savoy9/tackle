import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Returns true if the workspace is single-root (safe to activate).
 * Shows error and returns false if multi-root or no workspace.
 */
export async function checkSingleRootWorkspace(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    await vscode.window.showErrorMessage('Tackle requires an open workspace');
    return false;
  }

  if (folders.length > 1) {
    await vscode.window.showErrorMessage(
      'Tackle requires a single-root workspace. Multi-root workspaces are not supported.',
    );
    return false;
  }

  return true;
}

/**
 * Resolves the workspace root path. Returns `TACKLE_TEST_WORKSPACE` when set
 * (test-mode escape hatch), else `vscode.workspace.workspaceFolders[0].uri.fsPath`.
 */
export function resolveWorkspaceRoot(): string | undefined {
  return process.env.TACKLE_TEST_WORKSPACE ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Ensures .tackle/ directory exists and is in .gitignore.
 * Creates .tackle/ if missing. Creates/updates .gitignore.
 */
export async function ensureTackleDir(workspaceRoot: string): Promise<void> {
  const tackleDir = path.join(workspaceRoot, '.tackle');
  await fs.mkdir(tackleDir, { recursive: true });

  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  const entry = '.tackle/';

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n').map((l) => l.trim());
    if (!lines.includes(entry)) {
      await fs.writeFile(gitignorePath, content + '\n' + entry + '\n');
    }
  } catch {
    await fs.writeFile(gitignorePath, entry + '\n');
  }
}
