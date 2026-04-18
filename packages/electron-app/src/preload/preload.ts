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
      ipcRenderer.on('sync:completed', () => callback());
    },
  },
  terminal: {
    create: () => ipcRenderer.invoke('terminal:create'),
    list: () => ipcRenderer.invoke('terminal:list'),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    destroy: (id: string) => ipcRenderer.invoke('terminal:destroy', id),
    onData: (callback: (data: string) => void) => {
      ipcRenderer.on('terminal:data', (_event, data: string) => callback(data));
    },
  },
  sessions: {
    create: (options?: { name?: string; taskId?: number }) =>
      ipcRenderer.invoke('sessions:create', options),
    list: () => ipcRenderer.invoke('sessions:list'),
    listForTask: (taskId: number) => ipcRenderer.invoke('sessions:listForTask', taskId),
    stop: (id: number) => ipcRenderer.invoke('sessions:stop', id),
  },
});
