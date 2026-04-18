import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type Database } from '../db';
import { TaskRepository } from '../task-repository';
import { GitHubSyncService } from '../github-sync';

describe('GitHubSyncService IPC integration', () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new TaskRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  it('sync returns success result with count', async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 42,
                title: 'Test issue',
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

    const service = new GitHubSyncService(mockOctokit as any, repo, 'savoy9', 'chartroom');
    const result = await service.sync();

    expect(result.success).toBe(true);
    expect(result.synced).toBe(1);

    // Verify the task is in the DB
    const tasks = repo.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].external_id).toBe('42');
  });
});
