import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from '../db';
import { TaskRepository } from '../task-repository';

describe('TaskRepository', () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new TaskRepository(db);

    // Seed test data
    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, description, status, assignee)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('1', 'github', 'Build the thing', 'A description', 'open', 'alice');

    db.prepare(
      `INSERT INTO tasks (external_id, external_system, title, description, status, assignee)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('2', 'github', 'Fix the bug', 'Bug details', 'closed', null);
  });

  afterEach(() => {
    db?.close();
  });

  it('lists all tasks', () => {
    const tasks = repo.list();

    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Build the thing');
    expect(tasks[1].title).toBe('Fix the bug');
  });

  it('gets a task by id', () => {
    const task = repo.get(1);

    expect(task).toBeDefined();
    expect(task!.title).toBe('Build the thing');
    expect(task!.external_system).toBe('github');
    expect(task!.assignee).toBe('alice');
  });

  it('returns undefined for missing task', () => {
    const task = repo.get(999);
    expect(task).toBeUndefined();
  });

  it('upserts a task by external id', () => {
    // Update existing
    repo.upsert({
      external_id: '1',
      external_system: 'github',
      title: 'Build the thing (updated)',
      description: 'New description',
      status: 'closed',
      assignee: 'bob',
    });

    const task = repo.get(1);
    expect(task!.title).toBe('Build the thing (updated)');
    expect(task!.assignee).toBe('bob');

    // Insert new
    repo.upsert({
      external_id: '3',
      external_system: 'github',
      title: 'New task',
      description: '',
      status: 'open',
      assignee: null,
    });

    const tasks = repo.list();
    expect(tasks).toHaveLength(3);
  });
});
