// ── Domain types ──

export type SessionKind = 'plan' | 'implement' | 'review' | 'debug' | 'test' | 'pilot' | 'shell';

export type AgentState = 'idle' | 'working' | 'waiting';

export type TackleStatus =
  | 'not_started'
  | 'plan_started'
  | 'plan_awaiting_approval'
  | 'plan_approved'
  | 'implementation_started'
  | 'in_review'
  | 'pr_created'
  | 'merged';

export interface Task {
  id: number;
  external_id: string;
  external_system: 'github' | 'ado';
  title: string;
  description: string;
  external_status: string;
  assignee: string | null;
  parent_external_id: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_base_branch: string | null;
  tackle_status: TackleStatus;
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
  agent_state: AgentState;
  prior_claude_session_ids: string[] | null;
  started_at: string;
  ended_at: string | null;
  deleted_at?: string | null;
}

export type PlanSourceKind = 'markdown' | 'issue_body';

export interface Plan {
  id: number;
  task_id: number;
  source_path: string;
  source_kind: PlanSourceKind | null;
  source_ref: string | null;
  extracted_at: string | null;
  created_at: string;
}

export interface Phase {
  id: number;
  plan_id: number;
  task_id: number;
  external_id: string | null;
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

// ── Event Bus ──
export {
  createEventBus,
  type EventBus,
  type TackleEvent,
  type TaskPlanStartedEvent,
  type ExternalStatusChangedEvent,
  type PhaseCreatedEvent,
  type PhaseRemovedEvent,
  type PlanApprovedEvent,
  type TaskImplementationStartedEvent,
  type EventSource,
  type Handler,
} from './events/event-bus';
export { isLegalTackleTransition, isAtOrAfter } from './events/status-transition';
export { registerTaskPlanStartedHandler } from './events/handlers/task-plan-started';
export { registerExternalStatusChangedHandler } from './events/handlers/external-status-changed';
export { registerPlanApprovedHandler } from './events/handlers/plan-approved';
export { registerTaskImplementationStartedHandler } from './events/handlers/task-implementation-started';
export {
  registerPhaseCreatedHandler,
  registerPhaseRemovedHandler,
} from './events/handlers/phase-discovery';
export {
  computePhaseDiscoveryEvents,
  type ExternalChildItem,
  type LocalPhaseSnapshot,
  type DiscoverInput,
  type DiscoverOutput,
  type PhaseUpsert,
} from './plan-discovery';
export {
  detectPlanSource,
  type DetectPlanSourceInput,
  type DetectPlanSourceOutput,
} from './plan-source-detection';
export {
  computeLabelProjection,
  TACKLE_LABEL_BY_STATUS,
  type LabelProjectionInput,
  type LabelProjectionOutput,
} from './label-projection';

// ── Psmux ──
export { PsmuxBridge } from './psmux/index';
