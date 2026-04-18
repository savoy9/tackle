import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('chartroom', {
  version: '0.1.0',
});
