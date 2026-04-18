import { ipcMain } from 'electron';
import { TaskRepository } from './task-repository';

export function registerTaskHandlers(repo: TaskRepository): void {
  ipcMain.handle('tasks:list', () => {
    return repo.list();
  });

  ipcMain.handle('tasks:get', (_event, id: number) => {
    return repo.get(id);
  });
}
