import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('chartroom', {
  version: '0.1.0',
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: number) => ipcRenderer.invoke('tasks:get', id),
  },
  sync: {
    refresh: () => ipcRenderer.invoke('sync:refresh'),
    onCompleted: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('sync:completed', handler);
      return () => ipcRenderer.removeListener('sync:completed', handler);
    },
  },
  terminal: {
    write: (data: string) => ipcRenderer.invoke('terminal:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', cols, rows),
    switchSession: (sessionName: string) =>
      ipcRenderer.invoke('terminal:switchSession', sessionName),
    currentSession: () => ipcRenderer.invoke('terminal:currentSession'),
    onData: (callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
  },
  sessions: {
    create: (options?: { name?: string; taskId?: number; kind?: 'agent' | 'terminal' }) =>
      ipcRenderer.invoke('sessions:create', options),
    list: () => ipcRenderer.invoke('sessions:list'),
    listForTask: (taskId: number) => ipcRenderer.invoke('sessions:listForTask', taskId),
    stop: (id: number) => ipcRenderer.invoke('sessions:stop', id),
  },
  workspace: {
    switchTask: (taskId: number) => ipcRenderer.invoke('workspace:switchTask', taskId),
    currentTaskId: () => ipcRenderer.invoke('workspace:currentTaskId'),
    selectPhase: (phaseId: number | null) => ipcRenderer.invoke('workspace:selectPhase', phaseId),
    ensurePhaseWindow: (phaseId: number) => ipcRenderer.invoke('workspace:ensurePhaseWindow', phaseId),
  },
  plans: {
    link: (taskId: number, sourcePath: string, content: string) =>
      ipcRenderer.invoke('plan:link', taskId, sourcePath, content),
    getForTask: (taskId: number) => ipcRenderer.invoke('plan:getForTask', taskId),
  },
  phases: {
    listForTask: (taskId: number) => ipcRenderer.invoke('phases:listForTask', taskId),
    updateStatus: (phaseId: number, status: string) =>
      ipcRenderer.invoke('phases:updateStatus', phaseId, status),
  },
  files: {
    read: (relativePath: string) => ipcRenderer.invoke('file:read', relativePath),
    write: (relativePath: string, content: string) =>
      ipcRenderer.invoke('file:write', relativePath, content),
    list: (relativePath: string) => ipcRenderer.invoke('file:list', relativePath),
  },
});
