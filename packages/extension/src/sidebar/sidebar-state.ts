import type { Task, Session } from '@tackle/shared';

export type SidebarMode = 'list' | { kind: 'detail'; taskId: number };

export interface SidebarState {
  mode: SidebarMode;
  tasks: Task[];
  sessions: Session[];
  activeTaskId: number | undefined;
  expandedCardIds: Set<number>;
  closedFolderOpen: boolean;
  /** Precomputed markdown HTML for Task.description, keyed by task id. */
  descriptionsByTaskId: Record<number, string>;
  /** Reserved for future plan tracker rendering in Detail Mode (#31). MVP: always false. */
  hasPlanByTaskId: Record<number, boolean>;
}

export type SidebarAction =
  | { type: 'setTasks'; tasks: Task[] }
  | { type: 'setSessions'; sessions: Session[] }
  | { type: 'setActiveTask'; taskId: number | undefined }
  | { type: 'enterDetail'; taskId: number }
  | { type: 'exitDetail' }
  | { type: 'toggleExpanded'; taskId: number }
  | { type: 'toggleClosedFolder' }
  | { type: 'setDescriptions'; descriptionsByTaskId: Record<number, string> };

export const initialState: SidebarState = {
  mode: 'list',
  tasks: [],
  sessions: [],
  activeTaskId: undefined,
  expandedCardIds: new Set<number>(),
  closedFolderOpen: false,
  descriptionsByTaskId: {},
  hasPlanByTaskId: {},
};

export function reducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case 'setTasks':
      return { ...state, tasks: action.tasks };
    case 'setSessions':
      return { ...state, sessions: action.sessions };
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
    default:
      return state;
  }
}
