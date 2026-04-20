import type { SyncResult } from '@chartroom/shared';
import type { Octokit } from '@octokit/rest';
import type { TaskRepository, UpsertTask } from './task-repository';

export type { SyncResult };

export class GitHubSyncService {
  constructor(
    private octokit: Octokit,
    private repo: TaskRepository,
    private owner: string,
    private repoName: string,
  ) {}

  async sync(): Promise<SyncResult> {
    try {
      let page = 1;
      let hasMore = true;
      const batch: UpsertTask[] = [];

      while (hasMore) {
        const response = await this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repoName,
          state: 'all',
          per_page: 100,
          page,
        });

        const issues = response.data.filter(
          (issue: { pull_request?: unknown }) => !issue.pull_request,
        );

        for (const issue of issues) {
          batch.push({
            external_id: String(issue.number),
            external_system: 'github',
            title: issue.title,
            description: issue.body ?? '',
            status: issue.state ?? 'open',
            assignee: issue.assignee?.login ?? null,
          });
        }

        const link = response.headers?.link;
        hasMore = typeof link === 'string' && link.includes('rel="next"');
        page++;
      }

      this.repo.upsertBatch(batch);
      return { success: true, synced: batch.length };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
