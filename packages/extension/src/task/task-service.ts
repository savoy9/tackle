import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
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

    const { remote, diagnostics } = await this.getRemote();
    if (!remote) {
      throw new Error(
        `Could not determine GitHub repository from workspace. ${diagnostics}`,
      );
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

  /**
   * Resolve the first GitHub remote for the current workspace. Tries the
   * VS Code git extension first, then falls back to the `git` CLI. On
   * failure the returned `diagnostics` string explains what was tried and
   * why it failed — the caller surfaces this so the user doesn't have to
   * guess at the root cause (the old message "Is this a git repo with a
   * GitHub remote?" was unactionable when the real problem was, say, a
   * detached workspace folder or an SSH URL we didn't recognize).
   */
  private async getRemote(): Promise<{
    remote: { owner: string; repo: string } | null;
    diagnostics: string;
  }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return { remote: null, diagnostics: 'No workspace folder is open.' };
    }
    const cwd = workspaceFolder.uri.fsPath;
    const notes: string[] = [];

    // 1) VS Code git extension API (handles in-memory state + UX niceties).
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension) {
        if (!gitExtension.isActive) await gitExtension.activate();
        const git = gitExtension.exports.getAPI(1);
        const repos: Array<{ state: { remotes: Array<{ name?: string; fetchUrl?: string; pushUrl?: string }> } }>
          = git.repositories ?? [];
        for (const repo of repos) {
          for (const r of repo.state.remotes ?? []) {
            const url = r.fetchUrl ?? r.pushUrl;
            if (!url) continue;
            const parsed = TaskService.parseGitRemote(url);
            if (parsed) return { remote: parsed, diagnostics: '' };
            notes.push(`git-ext remote ${r.name ?? '?'}=${url} did not match a GitHub URL`);
          }
        }
        if (repos.length === 0) {
          notes.push('vscode.git reports no repositories (it may still be scanning)');
        }
      } else {
        notes.push('vscode.git extension not installed');
      }
    } catch (err) {
      notes.push(`vscode.git API threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2) git CLI fallback. List every remote so we pick up `upstream`,
    //    `github`, or whatever the user named their GitHub remote.
    try {
      const remoteList = execFileSync('git', ['remote'], { cwd, encoding: 'utf-8' })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (remoteList.length === 0) {
        notes.push(`git CLI: no remotes configured at ${cwd}`);
      }
      // Try `origin` first (most common), then the rest in declaration order.
      const ordered = remoteList.includes('origin')
        ? ['origin', ...remoteList.filter((r) => r !== 'origin')]
        : remoteList;
      for (const name of ordered) {
        try {
          const url = execFileSync('git', ['remote', 'get-url', name], { cwd, encoding: 'utf-8' }).trim();
          const parsed = TaskService.parseGitRemote(url);
          if (parsed) return { remote: parsed, diagnostics: '' };
          notes.push(`git CLI remote ${name}=${url} did not match a GitHub URL`);
        } catch (err) {
          notes.push(`git CLI: \`git remote get-url ${name}\` failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      notes.push(`git CLI: \`git remote\` at ${cwd} failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { remote: null, diagnostics: notes.join('; ') || 'No diagnostics available.' };
  }

  static parseGitRemote(remoteUrl: string): { owner: string; repo: string } | null {
    // Strip query strings / fragments that occasionally hitch a ride.
    const clean = remoteUrl.split(/[?#]/)[0].trim();

    const httpsMatch = clean.match(
      /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/,
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = clean.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // git:// and ssh:// schemes.
    const altMatch = clean.match(/^(?:git|ssh):\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (altMatch) {
      return { owner: altMatch[1], repo: altMatch[2] };
    }

    return null;
  }
}
