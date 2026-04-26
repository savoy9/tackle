import * as vscode from 'vscode';
import type { LayoutStateRepository, LayoutState } from '@tackle/shared';

export class LayoutManager {
  constructor(private layoutRepo: LayoutStateRepository) {}

  async saveLayoutState(
    taskId: string,
    terminalPlacements: { session_id: number; group_index: number }[],
  ): Promise<void> {
    const state: LayoutState = {
      task_id: taskId,
      editor_layout: { orientation: 0, groups: [{ size: 0.65 }, { size: 0.35 }] },
      terminal_placements: terminalPlacements,
      review_files: [],
      focused_session_id: null,
      focused_group_index: null,
    };
    await this.layoutRepo.save(state);
  }

  async restoreLayoutState(taskId: string): Promise<LayoutState | undefined> {
    const state = await this.layoutRepo.get(taskId);
    if (!state) return undefined;

    await vscode.commands.executeCommand('vscode.setEditorLayout', state.editor_layout);

    await Promise.all(
      state.review_files.map(async (filePath) => {
        try {
          const uri = vscode.Uri.parse(filePath);
          await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: 2 });
        } catch {
          /* file may not exist */
        }
      }),
    );

    return state;
  }
}
