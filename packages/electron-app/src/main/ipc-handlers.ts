import { ipcMain } from 'electron';
import { TaskRepository } from './task-repository';
import type { GitHubSyncService, SyncResult } from './github-sync';

export function registerTaskHandlers(repo: TaskRepository): void {
  ipcMain.handle('tasks:list', () => {
    return repo.list();
  });

  ipcMain.handle('tasks:get', (_event, id: number) => {
    return repo.get(id);
  });
}

export function registerSyncHandlers(syncService: GitHubSyncService | null): void {
  ipcMain.handle('sync:refresh', async (): Promise<SyncResult> => {
    if (!syncService) {
      return { success: false, error: 'GitHub sync not configured' };
    }
    return syncService.sync();
  });
}
