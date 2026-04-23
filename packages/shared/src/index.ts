// ── Domain types ──

export type SessionKind = 'plan' | 'implement' | 'review' | 'debug' | 'test' | 'pilot' | 'shell';

export interface Task {
  id: number;
  external_id: string;
  external_system: 'github' | 'ado';
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  parent_external_id: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_base_branch: string | null;
  synced_at: string;
  created_at: string;
}

export interface Session {
  id: number;
  task_id: number | null;
  phase_id: number | null;
  name: string;
  kind: SessionKind;
  status: 'running' | 'completed' | 'stopped';
  psmux_name: string;
  tab_label: string;
  agent: string | null;
  worktree_path: string | null;
  sort_order: number;
  claude_session_id: string | null;
  agent_state: 'idle' | 'working' | 'waiting';
  prior_claude_session_ids: string[] | null;
  started_at: string;
  ended_at: string | null;
  deleted_at?: string | null;
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

export interface TerminalPlacement {
  session_id: number;
  group_index: number;
}

export interface LayoutState {
  task_id: string;
  editor_layout: Record<string, unknown>;
  terminal_placements: TerminalPlacement[];
  review_files: string[];
  focused_session_id: string | null;
  focused_group_index: number | null;
}

export interface SyncResult {
  success: boolean;
  synced?: number;
  error?: string;
}

// ── Database layer ──
export * from './db/index';

// ── Psmux ──
export { PsmuxBridge } from './psmux/index';
