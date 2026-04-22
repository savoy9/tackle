import * as vscode from 'vscode';
import { join } from 'node:path';
import { createDatabase, PsmuxBridge } from '@tackle/shared';
import type { Database } from '@tackle/shared';

const SAVED_SETTINGS_KEY = 'tackle.savedSettings';
const ACTIVE_KEY = 'tackle.active';

const SETTINGS_TO_SAVE = [
  'terminal.integrated.defaultLocation',
  'workbench.panel.defaultLocation',
  'workbench.editor.showTabs',
] as const;

export class ModeManager {
  private db: Database | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async activate(): Promise<void> {
    const saved: Record<string, unknown> = {};
    for (const key of SETTINGS_TO_SAVE) {
      const [section, ...rest] = key.split('.');
      const configKey = rest.join('.');
      const config = vscode.workspace.getConfiguration(section);
      saved[key] = config.get(configKey);
    }
    await this.context.globalState.update(SAVED_SETTINGS_KEY, saved);

    const termConfig = vscode.workspace.getConfiguration('terminal.integrated');
    await termConfig.update('defaultLocation', 'editor', vscode.ConfigurationTarget.Global);

    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('vscode.setEditorLayout', {
      orientation: 0,
      groups: [{ size: 0.65 }, { size: 0.35 }],
    });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const dbPath = join(workspaceFolder.uri.fsPath, '.tackle', 'tackle.db');
      this.db = createDatabase(dbPath);
    }

    if (!PsmuxBridge.hasExecutable()) {
      vscode.window.showWarningMessage(
        'Tackle: tmux/psmux not found. Terminal session persistence will not work.',
      );
    }

    await vscode.commands.executeCommand('setContext', ACTIVE_KEY, true);
    await this.context.globalState.update(ACTIVE_KEY, true);
  }

  async deactivate(): Promise<void> {
    const saved = this.context.globalState.get<Record<string, unknown>>(SAVED_SETTINGS_KEY);
    if (saved) {
      for (const [key, value] of Object.entries(saved)) {
        const [section, ...rest] = key.split('.');
        const configKey = rest.join('.');
        const config = vscode.workspace.getConfiguration(section);
        await config.update(configKey, value, vscode.ConfigurationTarget.Global);
      }
    }

    await vscode.commands.executeCommand('setContext', ACTIVE_KEY, false);
    await this.context.globalState.update(ACTIVE_KEY, false);

    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  isActive(): boolean {
    return this.context.globalState.get<boolean>(ACTIVE_KEY) ?? false;
  }

  getDatabase(): Database | undefined {
    return this.db;
  }
}
