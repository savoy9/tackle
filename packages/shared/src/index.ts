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
  name: string;
  status: 'running' | 'completed' | 'stopped';
  psmux_session: string;
  started_at: string;
  ended_at: string | null;
}
