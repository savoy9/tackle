import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, SqliteTaskRepository, SqliteSessionRepository } from '@tackle/shared';
import type { Database } from '@tackle/shared';
import { taskList, taskShow, sessionList, sessionComplete } from '../commands';
import { findDatabasePath } from '../find-db';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('commands', () => {
  let db: Database;
  let taskRepo: SqliteTaskRepository;
  let sessionRepo: SqliteSessionRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    taskRepo = new SqliteTaskRepository(db);
    sessionRepo = new SqliteSessionRepository(db);
  });

  it('taskList returns formatted task list', async () => {
    await taskRepo.upsert({
      external_id: '1',
      external_system: 'github',
      title: 'Fix bug',
      description: 'desc',
      status: 'open',
      assignee: null,
    });
    await taskRepo.upsert({
      external_id: '2',
      external_system: 'github',
      title: 'Add feature',
      description: 'desc2',
      status: 'closed',
      assignee: 'alice',
    });
    const output = await taskList(taskRepo);
    expect(output).toContain('Fix bug');
    expect(output).toContain('Add feature');
    expect(output).toContain('[open]');
    expect(output).toContain('[closed]');
  });

  it('taskShow returns task details', async () => {
    await taskRepo.upsert({
      external_id: '10',
      external_system: 'ado',
      title: 'My Task',
      description: 'A description',
      status: 'active',
      assignee: 'bob',
    });
    const tasks = await taskRepo.list();
    const output = await taskShow(taskRepo, tasks[0].id);
    expect(output).toContain('My Task');
    expect(output).toContain('bob');
    expect(output).toContain('A description');
  });

  it('taskShow returns error for missing task', async () => {
    const output = await taskShow(taskRepo, 999);
    expect(output).toBe('Task #999 not found.');
  });

  it('sessionList returns sessions for a task', async () => {
    await taskRepo.upsert({
      external_id: '1',
      external_system: 'github',
      title: 'T',
      description: '',
      status: 'open',
      assignee: null,
    });
    const tasks = await taskRepo.list();
    const taskId = tasks[0].id;
    await sessionRepo.create({
      task_id: taskId,
      phase_id: null,
      name: 'sess1',
      kind: 'implement',
      psmux_name: 'p1',
    });
    const output = await sessionList(sessionRepo, taskId);
    expect(output).toContain('sess1');
    expect(output).toContain('implement');
    expect(output).toContain('[running]');
  });

  it('sessionComplete marks session as completed', async () => {
    await taskRepo.upsert({
      external_id: '1',
      external_system: 'github',
      title: 'T',
      description: '',
      status: 'open',
      assignee: null,
    });
    const tasks = await taskRepo.list();
    const session = await sessionRepo.create({
      task_id: tasks[0].id,
      phase_id: null,
      name: 's',
      kind: 'debug',
      psmux_name: 'p',
    });
    const output = await sessionComplete(sessionRepo, session.id);
    expect(output).toContain('marked as completed');
    const updated = await sessionRepo.get(session.id);
    expect(updated?.status).toBe('completed');
  });
});

describe('findDatabasePath', () => {
  it('finds .tackle/tackle.db in parent directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tackle-test-'));
    try {
      const tackleDir = join(tmp, '.tackle');
      mkdirSync(tackleDir);
      writeFileSync(join(tackleDir, 'tackle.db'), '');
      const child = join(tmp, 'sub', 'deep');
      mkdirSync(child, { recursive: true });
      const result = findDatabasePath(child);
      expect(result).toBe(join(tackleDir, 'tackle.db'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
