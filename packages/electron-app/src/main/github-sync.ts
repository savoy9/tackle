import type { Octokit } from '@octokit/rest';
import type { TaskRepository } from './task-repository';

export interface SyncResult {
  success: boolean;
  synced?: number;
  error?: string;
}

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
      let synced = 0;
      let hasMore = true;

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
          this.repo.upsert({
            external_id: String(issue.number),
            external_system: 'github',
            title: issue.title,
            description: issue.body ?? '',
            status: issue.state ?? 'open',
            assignee: issue.assignee?.login ?? null,
          });
          synced++;
        }

        // Check for next page via link header
        const link = response.headers?.link;
        hasMore = typeof link === 'string' && link.includes('rel="next"');
        page++;
      }

      return { success: true, synced };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
