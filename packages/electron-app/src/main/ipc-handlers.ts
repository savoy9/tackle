import { ipcMain, type BrowserWindow } from 'electron';
import { TaskRepository } from './task-repository';
import type { GitHubSyncService, SyncResult } from './github-sync';
import type { TerminalManager } from './terminal-manager';
import type { SessionManager } from './session-manager';

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

export function registerTerminalHandlers(
  manager: TerminalManager,
  getWindow?: () => BrowserWindow | null,
): void {
  ipcMain.handle('terminal:create', () => {
    const session = manager.create();

    // Forward pty data to renderer
    if (getWindow) {
      manager.onData(session.id, (data: string) => {
        const win = getWindow();
        if (win) {
          win.webContents.send('terminal:data', data);
        }
      });
    }

    return session;
  });

  ipcMain.handle('terminal:list', () => {
    return manager.list();
  });

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    manager.write(id, data);
  });

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    manager.resize(id, cols, rows);
  });

  ipcMain.handle('terminal:destroy', (_event, id: string) => {
    manager.destroy(id);
  });
}

export function registerSessionHandlers(sessionManager: SessionManager): void {
  ipcMain.handle('sessions:create', (_event, options?: { name?: string; taskId?: number }) => {
    const name = options?.name || `Session ${Date.now()}`;
    return sessionManager.create({ name, taskId: options?.taskId });
  });

  ipcMain.handle('sessions:list', () => {
    return sessionManager.list();
  });

  ipcMain.handle('sessions:listForTask', (_event, taskId: number) => {
    return sessionManager.listForTask(taskId);
  });

  ipcMain.handle('sessions:stop', (_event, id: number) => {
    sessionManager.stop(id);
  });
}
