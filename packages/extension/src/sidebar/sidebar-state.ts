import type { Task, Session, Phase, Plan } from '@tackle/shared';

export type SidebarMode = 'list' | { kind: 'detail'; taskId: number };

export interface SidebarState {
  mode: SidebarMode;
  tasks: Task[];
  sessions: Session[];
  /** Phases mirrored from the external tracker, indexed by sort_order. */
  phases: Phase[];
  /** Plans (currently one per Task at most). */
  plans: Plan[];
  activeTaskId: number | undefined;
  expandedCardIds: Set<number>;
  closedFolderOpen: boolean;
  /** Precomputed markdown HTML for Task.description, keyed by task id. */
  descriptionsByTaskId: Record<number, string>;
  /**
   * Whether the extension has completed `tackle.activate`. Before that point
   * the sidebar is rendered from a placeholder repo with no real data, and
   * the header shows an Activate button so the user doesn't have to hunt
   * through the command palette on every VS Code restart.
   */
  isActivated: boolean;
}

export type SidebarAction =
  | { type: 'setTasks'; tasks: Task[] }
  | { type: 'setSessions'; sessions: Session[] }
  | { type: 'setPhases'; phases: Phase[] }
  | { type: 'setPlans'; plans: Plan[] }
  | { type: 'setActiveTask'; taskId: number | undefined }
  | { type: 'enterDetail'; taskId: number }
  | { type: 'exitDetail' }
  | { type: 'toggleExpanded'; taskId: number }
  | { type: 'toggleClosedFolder' }
  | { type: 'setDescriptions'; descriptionsByTaskId: Record<number, string> }
  | { type: 'setActivated'; isActivated: boolean };

export const initialState: SidebarState = {
  mode: 'list',
  tasks: [],
  sessions: [],
  phases: [],
  plans: [],
  activeTaskId: undefined,
  expandedCardIds: new Set<number>(),
  closedFolderOpen: false,
  descriptionsByTaskId: {},
  isActivated: false,
};

export function reducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case 'setTasks':
      return { ...state, tasks: action.tasks };
    case 'setSessions':
      return { ...state, sessions: action.sessions };
    case 'setPhases':
      return { ...state, phases: action.phases };
    case 'setPlans':
      return { ...state, plans: action.plans };
    case 'setActiveTask':
      return { ...state, activeTaskId: action.taskId };
    case 'enterDetail':
      return { ...state, mode: { kind: 'detail', taskId: action.taskId } };
    case 'exitDetail':
      return { ...state, mode: 'list' };
    case 'toggleExpanded': {
      const next = new Set(state.expandedCardIds);
      if (next.has(action.taskId)) next.delete(action.taskId);
      else next.add(action.taskId);
      return { ...state, expandedCardIds: next };
    }
    case 'toggleClosedFolder':
      return { ...state, closedFolderOpen: !state.closedFolderOpen };
    case 'setDescriptions':
      return { ...state, descriptionsByTaskId: action.descriptionsByTaskId };
    case 'setActivated':
      if (state.isActivated === action.isActivated) return state;
      return { ...state, isActivated: action.isActivated };
    default:
      return state;
  }
}
