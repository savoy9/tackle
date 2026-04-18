import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type Database } from '../db';
import { TaskRepository } from '../task-repository';
import { GitHubSyncService } from '../github-sync';

describe('GitHubSyncService', () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new TaskRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  it('syncs GitHub issues into the tasks table', async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 1,
                title: 'First issue',
                body: 'Description of first issue',
                state: 'open',
                assignee: { login: 'alice' },
                pull_request: undefined,
              },
              {
                number: 2,
                title: 'Second issue',
                body: 'Description of second',
                state: 'closed',
                assignee: null,
                pull_request: undefined,
              },
            ],
            headers: { link: undefined },
          }),
        },
      },
    };

    const service = new GitHubSyncService(mockOctokit as any, repo, 'savoy9', 'chartroom');

    await service.sync();

    const tasks = repo.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('First issue');
    expect(tasks[0].external_id).toBe('1');
    expect(tasks[0].external_system).toBe('github');
    expect(tasks[0].assignee).toBe('alice');
    expect(tasks[1].title).toBe('Second issue');
    expect(tasks[1].status).toBe('closed');
    expect(tasks[1].assignee).toBeNull();
  });

  it('upserts on re-sync (updates existing, adds new)', async () => {
    // First sync
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 1,
                title: 'Original title',
                body: 'body',
                state: 'open',
                assignee: null,
                pull_request: undefined,
              },
            ],
            headers: { link: undefined },
          }),
        },
      },
    };

    const service = new GitHubSyncService(mockOctokit as any, repo, 'o', 'r');
    await service.sync();
    expect(repo.list()).toHaveLength(1);

    // Second sync with updated title + new issue
    mockOctokit.rest.issues.listForRepo.mockResolvedValue({
      data: [
        {
          number: 1,
          title: 'Updated title',
          body: 'body',
          state: 'closed',
          assignee: { login: 'bob' },
          pull_request: undefined,
        },
        {
          number: 3,
          title: 'New issue',
          body: '',
          state: 'open',
          assignee: null,
          pull_request: undefined,
        },
      ],
      headers: { link: undefined },
    });

    await service.sync();
    const tasks = repo.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Updated title');
    expect(tasks[0].status).toBe('closed');
    expect(tasks[0].assignee).toBe('bob');
    expect(tasks[1].title).toBe('New issue');
  });

  it('filters out pull requests', async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 1,
                title: 'Real issue',
                body: '',
                state: 'open',
                assignee: null,
                pull_request: undefined,
              },
              {
                number: 2,
                title: 'A pull request',
                body: '',
                state: 'open',
                assignee: null,
                pull_request: { url: 'https://...' },
              },
            ],
            headers: { link: undefined },
          }),
        },
      },
    };

    const service = new GitHubSyncService(mockOctokit as any, repo, 'o', 'r');
    await service.sync();

    const tasks = repo.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Real issue');
  });

  it('handles sync failure gracefully', async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockRejectedValue(new Error('API rate limit')),
        },
      },
    };

    const service = new GitHubSyncService(mockOctokit as any, repo, 'o', 'r');
    const result = await service.sync();

    expect(result.success).toBe(false);
    expect(result.error).toContain('API rate limit');
  });
});
