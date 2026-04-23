import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Task, TaskRepository } from '@tackle/shared';
import { git, gitTry } from './git';

/**
 * Pluggable source of `tackle.worktree.*` settings. A `WorktreeProvisioner`
 * consults this on every call so live VS Code setting changes are picked up
 * without recreating the provisioner. Returning `undefined` means
 * "use the built-in default" (`baseBranch='main'`,
 * `rootPath='../{repoName}.worktrees/'`).
 */
export interface WorktreeConfigReader {
  getBaseBranch(): string | undefined;
  getRootPath(): string | undefined;
}

export interface WorktreeProvisionerDeps {
  workspaceRoot: string;
  taskRepo: Pick<TaskRepository, 'get' | 'setWorktree'>;
  /**
   * Default base branch for new worktree branches. Default: 'main'.
   * Overridden per-call by `configReader.getBaseBranch()` when present.
   */
  baseBranch?: string;
  /**
   * Root directory where Tackle places per-task worktrees. Supports the
   * `{repoName}` placeholder. Default: `../{repoName}.worktrees/`.
   * Overridden per-call by `configReader.getRootPath()` when present.
   */
  rootPath?: string;
  /**
   * Optional injectable settings source. Read on every provision call so
   * that VS Code setting changes are picked up live.
   */
  configReader?: WorktreeConfigReader;
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

/**
 * Returns true when `cwd` is inside a git working tree (the main checkout or
 * any linked worktree). Returns false for non-git directories or when `git`
 * is unavailable.
 */
export function isGitWorkspace(cwd: string): boolean {
  if (!existsSync(cwd)) return false;
  const out = gitTry(cwd, ['rev-parse', '--is-inside-work-tree']);
  return out.ok && out.stdout.trim() === 'true';
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
  private readonly defaultBaseBranch: string;
  private readonly defaultRootPathTemplate: string;
  private readonly configReader?: WorktreeConfigReader;

  constructor(private readonly deps: WorktreeProvisionerDeps) {
    this.defaultBaseBranch = deps.baseBranch ?? 'main';
    this.defaultRootPathTemplate = deps.rootPath ?? '../{repoName}.worktrees/';
    this.configReader = deps.configReader;
  }

  private resolveBaseBranch(): string {
    return this.configReader?.getBaseBranch() ?? this.defaultBaseBranch;
  }

  private resolveRootPathTemplate(): string {
    return this.configReader?.getRootPath() ?? this.defaultRootPathTemplate;
  }

  async ensureWorktreeForTask(task: Task): Promise<WorktreeProvisionResult> {
    const workspaceRoot = this.deps.workspaceRoot;
    const baseBranch = this.resolveBaseBranch();

    // Hard-fail early when the workspace is not a git repo. We do this before
    // touching the DB so no partial state is written.
    if (!isGitWorkspace(workspaceRoot)) {
      throw new Error(
        `Tackle requires a git repository. The current workspace (${workspaceRoot}) is not a git repo. Initialize one with \`git init\` or open a folder inside a git repo.`,
      );
    }

    // Idempotent: if Task already has a worktree path on disk, return it.
    // Tackle never inspects, asserts, or mutates the worktree contents — a
    // dirty tree or a manually-checked-out branch is preserved as-is.
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

    // Missing-worktree recovery: the Task row points at a worktree path that
    // was deleted from disk. Prune the stale registration and recreate it at
    // the same path on the same branch. Silent — no user prompt.
    if (
      fresh.worktree_path
      && fresh.worktree_branch
      && fresh.worktree_base_branch
      && !existsSync(fresh.worktree_path)
    ) {
      // Clear any stale `git worktree` registration for the missing path.
      gitTry(workspaceRoot, ['worktree', 'prune']);
      const add = gitTry(workspaceRoot, ['worktree', 'add', fresh.worktree_path, fresh.worktree_branch]);
      if (!add.ok) {
        throw new Error(`git worktree add (recovery) failed: ${add.stderr}`);
      }
      const result: WorktreeProvisionResult = {
        path: fresh.worktree_path,
        branch: fresh.worktree_branch,
        baseBranch: fresh.worktree_base_branch,
      };
      await this.persist(task.id, result);
      return result;
    }

    // Workspace is itself a worktree → reuse it; skip nested creation.
    if (workspaceIsWorktree(workspaceRoot)) {
      const branch = this.currentBranch(workspaceRoot);
      const result: WorktreeProvisionResult = {
        path: workspaceRoot,
        branch,
        baseBranch,
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
      const result: WorktreeProvisionResult = { path, branch: matched, baseBranch };
      await this.persist(task.id, result);
      return result;
    }

    // Otherwise, create a fresh `<id>-<slug>` branch off baseBranch.
    const slugBranch = `${task.external_id}-${slugifyTitle(task.title)}`;
    const slugPath = this.resolveWorktreePath(workspaceRoot, slugBranch);
    let add = gitTry(workspaceRoot, ['worktree', 'add', '-b', slugBranch, slugPath, baseBranch]);
    if (add.ok) {
      const result: WorktreeProvisionResult = { path: slugPath, branch: slugBranch, baseBranch };
      await this.persist(task.id, result);
      return result;
    }

    if (!isCollision(add.stderr)) {
      throw new Error(`git worktree add failed: ${add.stderr}`);
    }

    // Collision → fall back to `tackle/<external-id>`.
    const fallbackBranch = `tackle/${task.external_id}`;
    const fallbackPath = this.resolveWorktreePath(workspaceRoot, `tackle-${task.external_id}`);
    add = gitTry(workspaceRoot, ['worktree', 'add', '-b', fallbackBranch, fallbackPath, baseBranch]);
    if (!add.ok) throw new Error(`git worktree add failed (fallback): ${add.stderr}`);
    const result: WorktreeProvisionResult = { path: fallbackPath, branch: fallbackBranch, baseBranch };
    await this.persist(task.id, result);
    return result;
  }

  /**
   * Create a per-Session α-isolation sub-worktree branched off the Task's
   * existing worktree branch. Caller is responsible for storing the result on
   * `Session.worktree_path`; this method does NOT touch the Task row.
   *
   * @param task           The Task that owns the parent worktree. Must already
   *                       have `worktree_path` / `worktree_branch` populated
   *                       (i.e. `ensureWorktreeForTask` ran first).
   * @param sessionRef     A stable identifier (typically the Session id, or a
   *                       monotonically-increasing per-task ordinal) used as
   *                       the suffix on the sub-branch and sub-directory.
   */
  async createIsolatedWorktree(
    task: Task,
    sessionRef: number | string,
  ): Promise<WorktreeProvisionResult> {
    if (!task.worktree_path || !task.worktree_branch) {
      throw new Error(
        `Cannot α-isolate session: Task ${task.id} has no worktree yet. `
        + `Call ensureWorktreeForTask first.`,
      );
    }
    const workspaceRoot = this.deps.workspaceRoot;
    const subBranch = `${task.worktree_branch}-${sessionRef}`;
    const subDir = `${task.worktree_branch.replace(/[\\/]/g, '-')}-${sessionRef}`;
    const subPath = this.resolveWorktreePath(workspaceRoot, subDir);

    const add = gitTry(workspaceRoot, [
      'worktree', 'add', '-b', subBranch, subPath, task.worktree_branch,
    ]);
    if (!add.ok) {
      throw new Error(`git worktree add (α-isolation) failed: ${add.stderr}`);
    }
    return {
      path: subPath,
      branch: subBranch,
      baseBranch: task.worktree_branch,
    };
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
    const template = this.resolveRootPathTemplate();
    const rel = template.replace(/\{repoName\}/g, repoName);
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
