import type { Task, Session, LayoutState, Plan, Phase } from '../index';

export interface UpsertTask {
  external_id: string;
  external_system: 'github' | 'ado';
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  parent_external_id?: string | null;
}

export interface CreateSession {
  task_id: number | null;
  phase_id: number | null;
  name: string;
  kind: Session['kind'];
  psmux_name: string;
  tab_label?: string;
  agent?: string | null;
  worktree_path?: string | null;
  sort_order?: number;
  claude_session_id?: string | null;
  agent_state?: 'idle' | 'working' | 'waiting';
  prior_claude_session_ids?: string[] | null;
}

export interface UpdateSession {
  name?: string;
  kind?: Session['kind'];
  status?: Session['status'];
  tab_label?: string;
  agent?: string | null;
  worktree_path?: string | null;
  sort_order?: number;
  claude_session_id?: string | null;
  agent_state?: 'idle' | 'working' | 'waiting';
  prior_claude_session_ids?: string[] | null;
  ended_at?: string | null;
}

export interface TaskWorktreeFields {
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_base_branch: string | null;
}

export interface TaskRepository {
  list(): Promise<Task[]>;
  get(id: number): Promise<Task | undefined>;
  upsert(task: UpsertTask): Promise<void>;
  upsertBatch(tasks: UpsertTask[]): Promise<void>;
  setWorktree(id: number, fields: TaskWorktreeFields): Promise<void>;
}

export interface SessionRepository {
  list(): Promise<Session[]>;
  get(id: number): Promise<Session | undefined>;
  listForTask(taskId: number): Promise<Session[]>;
  create(session: CreateSession): Promise<Session>;
  update(id: number, fields: UpdateSession): Promise<void>;
  complete(id: number): Promise<void>;
  softDelete(id: number): Promise<void>;
  /**
   * Hot-path write for AgentStateDetector transitions. Updates only the
   * `agent_state` column without touching any other field, so we can fire
   * cheaply on every detector event without rewriting the whole row.
   */
  setAgentState(id: number, state: 'idle' | 'working' | 'waiting'): Promise<void>;
}

export interface LayoutStateRepository {
  get(taskId: string): Promise<LayoutState | undefined>;
  save(state: LayoutState): Promise<void>;
}

export interface PlanRepository {
  get(taskId: number): Promise<Plan | undefined>;
  save(plan: Omit<Plan, 'id' | 'created_at'>): Promise<Plan>;
}

export interface PhaseRepository {
  listForPlan(planId: number): Promise<Phase[]>;
  get(id: number): Promise<Phase | undefined>;
  update(id: number, fields: Partial<Pick<Phase, 'name' | 'description' | 'status' | 'sort_order'>>): Promise<void>;
}
