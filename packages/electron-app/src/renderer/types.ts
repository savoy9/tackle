import type { Task, SyncResult, Plan, Phase } from '@tackle/shared';

export type { SyncResult };

export interface ManagedSessionInfo {
  id: number;
  name: string;
  kind: 'agent' | 'terminal';
  status: 'running' | 'completed' | 'stopped';
  task_id: number | null;
  phase_id: number | null;
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
    onCompleted: (callback: () => void) => () => void;
  };
  terminal: {
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    switchSession: (sessionName: string) => Promise<void>;
    currentSession: () => Promise<string>;
    onData: (callback: (data: string) => void) => () => void;
  };
  sessions: {
    create: (options?: { name?: string; taskId?: number; kind?: 'agent' | 'terminal' }) => Promise<ManagedSessionInfo>;
    list: () => Promise<ManagedSessionInfo[]>;
    listForTask: (taskId: number) => Promise<ManagedSessionInfo[]>;
    stop: (id: number) => Promise<void>;
  };
  workspace: {
    switchTask: (taskId: number) => Promise<{ taskId: number; sessionName: string }>;
    currentTaskId: () => Promise<number | null>;
    selectPhase: (phaseId: number | null) => Promise<void>;
    ensurePhaseWindow: (phaseId: number) => Promise<string>;
  };
  plans: {
    link: (taskId: number, sourcePath: string, content: string) => Promise<{ plan: Plan; phases: Phase[] }>;
    getForTask: (taskId: number) => Promise<Plan | undefined>;
  };
  phases: {
    listForTask: (taskId: number) => Promise<Phase[]>;
    updateStatus: (phaseId: number, status: string) => Promise<void>;
  };
  files: {
    read: (relativePath: string) => Promise<string>;
    write: (relativePath: string, content: string) => Promise<void>;
    list: (relativePath: string) => Promise<{ name: string; isDirectory: boolean }[]>;
  };
}

declare global {
  interface Window {
    chartroom: ChartroomAPI;
  }
}
