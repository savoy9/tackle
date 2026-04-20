export interface Task {
  id: number;
  external_id: string;
  external_system: 'github' | 'ado';
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  synced_at: string;
  created_at: string;
}

export interface Session {
  id: number;
  task_id: number | null;
  phase_id: number | null;
  name: string;
  kind: 'agent' | 'terminal';
  status: 'running' | 'completed' | 'stopped';
  psmux_session: string;
  started_at: string;
  ended_at: string | null;
}

export interface SyncResult {
  success: boolean;
  synced?: number;
  error?: string;
}

export interface Plan {
  id: number;
  task_id: number;
  source_path: string;
  extracted_at: string | null;
  created_at: string;
}

export interface Phase {
  id: number;
  plan_id: number;
  task_id: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  sort_order: number;
  created_at: string;
}

export interface TerminalSessionInfo {
  id: string;
  status: 'running' | 'exited';
  pid: number;
}
