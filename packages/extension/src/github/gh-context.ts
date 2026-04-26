// Shared resolution of {owner, repo, headers} for GitHub REST calls made by
// cross-cutting features (sub-issue fetch, Label Projector). Reuses the
// same remote-resolution path as Sync so a workspace whose GH repo is
// inferred from `vscode.git` (no `tackle.github.repo` setting) works for
// these features too.

import * as vscode from 'vscode';
import type { TaskService } from '../task/task-service';

export const GH_API_VERSION = '2026-03-10';
export const GH_ACCEPT = 'application/vnd.github+json';

export interface GitHubContext {
  owner: string;
  repo: string;
  headers: Record<string, string>;
}

export async function resolveGitHubContext(
  taskService: TaskService,
): Promise<GitHubContext | null> {
  const session = await vscode.authentication.getSession('github', ['repo'], {
    createIfNone: false,
  });
  if (!session) return null;
  const remote = await taskService.resolveRemote();
  if (!remote) return null;
  return {
    owner: remote.owner,
    repo: remote.repo,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: GH_ACCEPT,
      'X-GitHub-Api-Version': GH_API_VERSION,
    },
  };
}
