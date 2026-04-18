import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('chartroom', {
  version: '0.1.0',
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: number) => ipcRenderer.invoke('tasks:get', id),
  },
  sync: {
    refresh: () => ipcRenderer.invoke('sync:refresh'),
  },
});
