import type { TaskRepository, SessionRepository } from '@tackle/shared';

export async function taskList(taskRepo: TaskRepository): Promise<string> {
  const tasks = await taskRepo.list();
  if (tasks.length === 0) return 'No tasks found.';
  return tasks.map((t) => `#${t.id}  [${t.external_status}]  ${t.title}`).join('\n');
}

export async function taskShow(taskRepo: TaskRepository, id: number): Promise<string> {
  const task = await taskRepo.get(id);
  if (!task) return `Task #${id} not found.`;
  return [
    `Task #${task.id}`,
    `Title:       ${task.title}`,
    `Status:      ${task.external_status}`,
    `Assignee:    ${task.assignee ?? '(none)'}`,
    `Description: ${task.description}`,
    `Created:     ${task.created_at}`,
  ].join('\n');
}

export async function sessionList(sessionRepo: SessionRepository, taskId: number): Promise<string> {
  const sessions = await sessionRepo.listForTask(taskId);
  if (sessions.length === 0) return `No sessions for task #${taskId}.`;
  return sessions.map((s) => `#${s.id}  [${s.status}]  ${s.kind}  ${s.name}`).join('\n');
}

export async function sessionComplete(
  sessionRepo: SessionRepository,
  sessionId: number,
): Promise<string> {
  const session = await sessionRepo.get(sessionId);
  if (!session) return `Session #${sessionId} not found.`;
  await sessionRepo.complete(sessionId);
  return `Session #${sessionId} marked as completed.`;
}
