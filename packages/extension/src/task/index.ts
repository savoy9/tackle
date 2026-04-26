export { TaskService } from './task-service';
export { registerLabelProjector } from './label-projector';
export type { LabelProjectorDeps } from './label-projector';
export { TaskRemover, assessWorktreeCleanliness } from './task-remover';
export type {
  TaskRemoverDeps,
  RemovePromptFn,
  PromptChoice,
  WorktreeCleanliness,
  RemoveTaskResult,
} from './task-remover';
