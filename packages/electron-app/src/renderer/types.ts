import type { Task } from '@chartroom/shared';

export interface SyncResult {
  success: boolean;
  synced?: number;
  error?: string;
}

export interface ChartroomAPI {
  version: string;
  tasks: {
    list: () => Promise<Task[]>;
    get: (id: number) => Promise<Task | undefined>;
  };
  sync: {
    refresh: () => Promise<SyncResult>;
  };
}

declare global {
  interface Window {
    chartroom: ChartroomAPI;
  }
}
