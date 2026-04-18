import type { Task } from '@chartroom/shared';

export interface SyncResult {
  success: boolean;
  synced?: number;
  error?: string;
}

export interface TerminalSessionInfo {
  id: string;
  status: 'running' | 'exited';
  pid: number;
}

export interface ManagedSessionInfo {
  id: number;
  name: string;
  status: 'running' | 'completed' | 'stopped';
  task_id: number | null;
  terminal_id: string;
}

export interface ChartroomAPI {
  version: string;
  tasks: {
    list: () => Promise<Task[]>;
    get: (id: number) => Promise<Task | undefined>;
  };
  sync: {
    refresh: () => Promise<SyncResult>;
    onCompleted: (callback: () => void) => void;
  };
  terminal: {
    create: () => Promise<TerminalSessionInfo>;
    list: () => Promise<TerminalSessionInfo[]>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    destroy: (id: string) => void;
    onData: (callback: (data: string) => void) => void;
  };
  sessions: {
    create: (options?: { name?: string; taskId?: number }) => Promise<ManagedSessionInfo>;
    list: () => Promise<ManagedSessionInfo[]>;
    listForTask: (taskId: number) => Promise<ManagedSessionInfo[]>;
    stop: (id: number) => Promise<void>;
  };
}

declare global {
  interface Window {
    chartroom: ChartroomAPI;
  }
}
