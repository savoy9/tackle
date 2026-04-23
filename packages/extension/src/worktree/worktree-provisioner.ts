import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Task, TaskRepository } from '@tackle/shared';

export interface WorktreeProvisionerDeps {
  workspaceRoot: string;
  taskRepo: Pick<TaskRepository, 'get' | 'setWorktree'>;
  /** Default base branch for new worktree branches. Default: 'main'. */
  baseBranch?: string;
  /**
   * Root directory where Tackle places per-task worktrees. Supports the
   * `{repoName}` placeholder. Default: `../{repoName}.worktrees/`.
   */
  rootPath?: string;
}

export interface WorktreeProvisionResult {
  path: string;
  branch: string;
  baseBranch: string;
}

/**
 * Slugify a Task title for use in a branch / directory name. Lowercases,
 * replaces non-alnum runs with `-`, trims, and caps length.
 */
export function slugifyTitle(title: string, maxLen = 40): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length === 0) return 'task';
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen).replace(/-+$/g, '');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function gitTry(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout: out.toString(), stderr: '' };
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err.stdout ?? '').toString(),
      stderr: (err.stderr ?? err.message ?? '').toString(),
    };
  }
}

/**
 * Returns true when `cwd` is itself a git worktree (its `.git` is a worktree
 * gitfile under the main repo's `.git/worktrees/` directory). The repo's
 * main checkout returns false.
 */
export function workspaceIsWorktree(cwd: string): boolean {
  const out = gitTry(cwd, ['rev-parse', '--git-dir']);
  if (!out.ok) return false;
  const gitDir = out.stdout.trim();
  return /[\\/]\.git[\\/]worktrees[\\/]/.test(gitDir);
}

export class WorktreeProvisioner {
  private readonly baseBranch: string;
  private readonly rootPathTemplate: string;

  constructor(private readonly deps: WorktreeProvisionerDeps) {
    this.baseBranch = deps.baseBranch ?? 'main';
    this.rootPathTemplate = deps.rootPath ?? '../{repoName}.worktrees/';
  }

  async ensureWorktreeForTask(task: Task): Promise<WorktreeProvisionResult> {
    const workspaceRoot = this.deps.workspaceRoot;

    // Idempotent: if Task already has a worktree path on disk, return it.
    const fresh = (await this.deps.taskRepo.get(task.id)) ?? task;
    if (
      fresh.worktree_path
      && fresh.worktree_branch
      && fresh.worktree_base_branch
      && existsSync(fresh.worktree_path)
    ) {
      return {
        path: fresh.worktree_path,
        branch: fresh.worktree_branch,
        baseBranch: fresh.worktree_base_branch,
      };
    }

    // Workspace is itself a worktree → reuse it; skip nested creation.
    if (workspaceIsWorktree(workspaceRoot)) {
      const branch = this.currentBranch(workspaceRoot);
      const result: WorktreeProvisionResult = {
        path: workspaceRoot,
        branch,
        baseBranch: this.baseBranch,
      };
      await this.persist(task.id, result);
      return result;
    }

    // Reuse existing matching local branch (case-insensitive contains <external-id>).
    const matched = this.findExistingMatchingBranch(workspaceRoot, task.external_id);
    if (matched) {
      const path = this.resolveWorktreePath(workspaceRoot, matched);
      const add = gitTry(workspaceRoot, ['worktree', 'add', path, matched]);
      if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr}`);
      const result: WorktreeProvisionResult = { path, branch: matched, baseBranch: this.baseBranch };
      await this.persist(task.id, result);
      return result;
    }

    // Otherwise, create a fresh `<id>-<slug>` branch off baseBranch.
    const slugBranch = `${task.external_id}-${slugifyTitle(task.title)}`;
    const slugPath = this.resolveWorktreePath(workspaceRoot, slugBranch);
    let add = gitTry(workspaceRoot, ['worktree', 'add', '-b', slugBranch, slugPath, this.baseBranch]);
    if (add.ok) {
      const result: WorktreeProvisionResult = { path: slugPath, branch: slugBranch, baseBranch: this.baseBranch };
      await this.persist(task.id, result);
      return result;
    }

    if (!isCollision(add.stderr)) {
      throw new Error(`git worktree add failed: ${add.stderr}`);
    }

    // Collision → fall back to `tackle/<external-id>`.
    const fallbackBranch = `tackle/${task.external_id}`;
    const fallbackPath = this.resolveWorktreePath(workspaceRoot, `tackle-${task.external_id}`);
    add = gitTry(workspaceRoot, ['worktree', 'add', '-b', fallbackBranch, fallbackPath, this.baseBranch]);
    if (!add.ok) throw new Error(`git worktree add failed (fallback): ${add.stderr}`);
    const result: WorktreeProvisionResult = { path: fallbackPath, branch: fallbackBranch, baseBranch: this.baseBranch };
    await this.persist(task.id, result);
    return result;
  }

  private async persist(taskId: number, r: WorktreeProvisionResult): Promise<void> {
    await this.deps.taskRepo.setWorktree(taskId, {
      worktree_path: r.path,
      worktree_branch: r.branch,
      worktree_base_branch: r.baseBranch,
    });
  }

  private currentBranch(cwd: string): string {
    return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  private resolveWorktreePath(workspaceRoot: string, dirName: string): string {
    const repoName = basename(workspaceRoot);
    const parent = dirname(workspaceRoot);
    const rel = this.rootPathTemplate.replace(/\{repoName\}/g, repoName);
    const root = resolve(parent, rel);
    // Sanitize directory name (strip path separators introduced by branch names like `tackle/42`).
    const safe = dirName.replace(/[\\/]/g, '-');
    return join(root, safe);
  }

  private findExistingMatchingBranch(cwd: string, externalId: string): string | null {
    const out = gitTry(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
    if (!out.ok) return null;
    const all = out.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const needle = externalId.toLowerCase();
    const matches = all.filter((b) => b.toLowerCase().includes(needle));
    return matches.length === 1 ? matches[0] : null;
  }
}

function isCollision(stderr: string): boolean {
  return /already exists|already used|already checked out/i.test(stderr);
}
