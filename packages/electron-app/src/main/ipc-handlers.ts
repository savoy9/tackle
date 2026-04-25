import { ipcMain, BrowserWindow } from 'electron';
import { TaskRepository } from './task-repository';
import type { GitHubSyncService, SyncResult } from './github-sync';
import type { WorkspaceManager } from './workspace-manager';
import type { PlanService } from './plan-service';
import type { PhaseRepository } from './phase-repository';
import type { PsmuxAttachment } from './psmux-attachment';
import type { PsmuxManager } from './psmux-manager';
import type { FileService } from './file-service';

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

export function registerSessionHandlers(workspace: WorkspaceManager): void {
  ipcMain.handle(
    'sessions:create',
    (_event, options?: { name?: string; taskId?: number; kind?: 'agent' | 'terminal' }) => {
      const name = options?.name || `Session ${Date.now()}`;
      return workspace.sessionManager.create({
        name,
        taskId: options?.taskId,
        kind: options?.kind,
      });
    },
  );

  ipcMain.handle('sessions:list', () => {
    return workspace.sessionManager.list();
  });

  ipcMain.handle('sessions:listForTask', (_event, taskId: number) => {
    return workspace.sessionManager.listForTask(taskId);
  });

  ipcMain.handle('sessions:stop', (_event, id: number) => {
    workspace.sessionManager.stop(id);
  });
}

export function registerTerminalHandlers(
  attachment: PsmuxAttachment,
  psmux: PsmuxManager,
  defaultSessionName: string,
): void {
  let currentSession = defaultSessionName;

  // Attach to the default session on startup
  attachment.attach(currentSession);

  // Forward terminal data to all renderer windows
  attachment.onData((data: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('terminal:data', data);
    }
  });

  ipcMain.handle('terminal:write', (_event, data: string) => {
    attachment.write(data);
  });

  ipcMain.handle('terminal:resize', (_event, cols: number, rows: number) => {
    attachment.resize(cols, rows);
  });

  ipcMain.handle('terminal:switchSession', (_event, sessionName: string) => {
    if (sessionName === currentSession) return;

    // Ensure the target session exists
    if (!psmux.hasSession(sessionName)) {
      psmux.createSession(sessionName);
    }

    attachment.detach();
    attachment.attach(sessionName);
    currentSession = sessionName;
  });

  ipcMain.handle('terminal:currentSession', () => {
    return currentSession;
  });
}

export function registerWorkspaceHandlers(
  workspace: WorkspaceManager,
  attachment: PsmuxAttachment,
): void {
  ipcMain.handle('workspace:switchTask', (_event, taskId: number) => {
    const sessionName = workspace.switchTask(taskId);

    // Switch the terminal attachment to the new task's psmux session
    attachment.detach();
    attachment.attach(sessionName);

    return { taskId, sessionName };
  });

  ipcMain.handle('workspace:currentTaskId', () => {
    return workspace.currentTaskId;
  });

  ipcMain.handle('workspace:selectPhase', (_event, phaseId: number | null) => {
    workspace.selectPhase(phaseId);
  });

  ipcMain.handle('workspace:ensurePhaseWindow', (_event, phaseId: number) => {
    return workspace.ensurePhaseWindow(phaseId);
  });
}

export function registerPlanHandlers(planService: PlanService, phaseRepo: PhaseRepository): void {
  ipcMain.handle(
    'plan:link',
    async (_event, taskId: number, sourcePath: string, content: string) => {
      return planService.linkPlan(taskId, sourcePath, content);
    },
  );

  ipcMain.handle('plan:getForTask', (_event, taskId: number) => {
    return planService.getPlanForTask(taskId);
  });

  ipcMain.handle('phases:listForTask', (_event, taskId: number) => {
    return planService.getPhasesForTask(taskId);
  });

  ipcMain.handle(
    'phases:updateStatus',
    (_event, phaseId: number, status: 'pending' | 'in_progress' | 'done' | 'failed') => {
      phaseRepo.updateStatus(phaseId, status);
    },
  );
}

export function registerFileHandlers(fileService: FileService): void {
  ipcMain.handle('file:read', (_event, relativePath: string) => {
    return fileService.readFile(relativePath);
  });

  ipcMain.handle('file:write', (_event, relativePath: string, content: string) => {
    fileService.writeFile(relativePath, content);
  });

  ipcMain.handle('file:list', (_event, relativePath: string) => {
    return fileService.listDirectory(relativePath);
  });
}
