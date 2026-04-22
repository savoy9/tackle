import type { Task } from '@tackle/shared';

export type SidebarMode = 'list' | { kind: 'detail'; taskId: number };

export interface SidebarState {
  mode: SidebarMode;
  tasks: Task[];
  activeTaskId: number | undefined;
  expandedCardIds: Set<number>;
  closedFolderOpen: boolean;
}

export type SidebarAction =
  | { type: 'setTasks'; tasks: Task[] }
  | { type: 'setActiveTask'; taskId: number | undefined }
  | { type: 'enterDetail'; taskId: number }
  | { type: 'exitDetail' }
  | { type: 'toggleExpanded'; taskId: number }
  | { type: 'toggleClosedFolder' };

export const initialState: SidebarState = {
  mode: 'list',
  tasks: [],
  activeTaskId: undefined,
  expandedCardIds: new Set<number>(),
  closedFolderOpen: false,
};

export function reducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case 'setTasks':
      return { ...state, tasks: action.tasks };
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
    default:
      return state;
  }
}
