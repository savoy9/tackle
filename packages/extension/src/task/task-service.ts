import * as vscode from 'vscode';
import { execSync } from 'node:child_process';
import type { TaskRepository, UpsertTask } from '@tackle/shared';

export class TaskService {
  constructor(private taskRepo: TaskRepository) {}

  async syncFromGitHub(): Promise<number> {
    const session = await vscode.authentication.getSession('github', ['repo'], {
      createIfNone: true,
    });
    if (!session) {
      throw new Error('GitHub authentication required');
    }

    const remote = await this.getRemote();
    if (!remote) {
      throw new Error('Could not determine GitHub repository from workspace. Is this a git repo with a GitHub remote?');
    }

    const response = await fetch(
      `https://api.github.com/repos/${remote.owner}/${remote.repo}/issues?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issues = (await response.json()) as Array<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      assignee: { login: string } | null;
    }>;

    const tasks: UpsertTask[] = issues.map((issue) => ({
      external_id: String(issue.number),
      external_system: 'github' as const,
      title: issue.title,
      description: issue.body ?? '',
      status: issue.state,
      assignee: issue.assignee?.login ?? null,
    }));

    await this.taskRepo.upsertBatch(tasks);
    return tasks.length;
  }

  private async getRemote(): Promise<{ owner: string; repo: string } | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    const cwd = workspaceFolder.uri.fsPath;

    // Try VS Code git extension API first
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension) {
        if (!gitExtension.isActive) await gitExtension.activate();
        const git = gitExtension.exports.getAPI(1);
        const repo = git.repositories[0];
        if (repo) {
          const remoteUrl = repo.state.remotes[0]?.fetchUrl;
          if (remoteUrl) {
            const parsed = TaskService.parseGitRemote(remoteUrl);
            if (parsed) return parsed;
          }
        }
      }
    } catch (err) {
      console.log('Tackle: git extension API failed, falling back to CLI', err);
    }

    // Fall back to git CLI
    try {
      const remoteUrl = execSync('git remote get-url origin', { cwd, encoding: 'utf-8' }).trim();
      if (remoteUrl) return TaskService.parseGitRemote(remoteUrl);
    } catch (err) {
      console.log('Tackle: git CLI fallback failed', err);
    }

    return null;
  }

  static parseGitRemote(remoteUrl: string): { owner: string; repo: string } | null {
    const httpsMatch = remoteUrl.match(
      /https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/,
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
  }
}
