import type { Task } from '@tackle/shared';

const CLOSED_SET = new Set(['closed', 'done', 'completed', 'resolved', 'removed']);

/** Pure predicate for whether a task's external `status` represents a closed/done issue. */
export function isClosedStatus(status: string): boolean {
  return CLOSED_SET.has((status ?? '').toLowerCase());
}

/** Splits a task list into open and closed subsets preserving input order. */
export function partitionTasks(tasks: Task[]): { open: Task[]; closed: Task[] } {
  const open: Task[] = [];
  const closed: Task[] = [];
  for (const t of tasks) {
    if (isClosedStatus(t.status)) closed.push(t);
    else open.push(t);
  }
  return { open, closed };
}
