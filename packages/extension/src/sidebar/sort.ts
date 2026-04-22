import type { Task, Session } from '@tackle/shared';

/**
 * Activity bucket priority (lower = higher priority / earlier in list):
 *   0 waiting   (any session with agent_state=waiting)
 *   1 working   (any session with agent_state=working)
 *   2 running   (any session with status=running)
 *   3 other
 */
function activityBucket(sessions: Session[] | undefined): number {
  if (!sessions || sessions.length === 0) return 3;
  if (sessions.some((s) => s.status === 'running' && s.agent_state === 'waiting')) return 0;
  if (sessions.some((s) => s.status === 'running' && s.agent_state === 'working')) return 1;
  if (sessions.some((s) => s.status === 'running')) return 2;
  return 3;
}

function updatedKey(t: Task): string {
  // Task currently carries synced_at/created_at; treat the most recent of those
  // as its updated_at for ordering purposes. Issue #33 may formalize updated_at.
  return t.synced_at || t.created_at || '';
}

/** Pure sort: activity-first (waiting > working > running > other), then updated_at desc. */
export function sortTasks(tasks: Task[], sessionsByTaskId: Map<number, Session[]>): Task[] {
  return tasks.slice().sort((a, b) => {
    const ba = activityBucket(sessionsByTaskId.get(a.id));
    const bb = activityBucket(sessionsByTaskId.get(b.id));
    if (ba !== bb) return ba - bb;
    const ua = updatedKey(a);
    const ub = updatedKey(b);
    if (ua !== ub) return ua < ub ? 1 : -1;
    return a.id - b.id;
  });
}
