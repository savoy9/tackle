import { existsSync } from 'node:fs';
import type { Task, TaskRepository } from '@tackle/shared';
import { gitTry } from '../worktree/git';

/**
 * Result of inspecting a Task's worktree to decide a confirmation default.
 *
 * - `clean`: no uncommitted changes AND no commits ahead of base branch.
 * - `reason`: human-readable summary of why it's dirty (empty string if clean).
 */
export interface WorktreeCleanliness {
  clean: boolean;
  reason: string;
  unstagedFiles: number;
  commitsAhead: number;
}

export interface PromptChoice {
  /** True if the user confirmed worktree deletion. */
  remove: boolean;
  /** True if `--force` should be passed to `git worktree remove`. */
  force: boolean;
}

/**
 * Caller-supplied UI hook. Tackle calls this once with the cleanliness
 * assessment; the implementation returns the user's decision.
 *
 * Implementations typically wrap `vscode.window.showWarningMessage` with
 * a default-button modal — but the TaskRemover deliberately doesn't
 * import vscode itself so it stays trivially unit-testable.
 */
export type RemovePromptFn = (
  task: Task,
  cleanliness: WorktreeCleanliness,
) => Promise<PromptChoice>;

export interface TaskRemoverDeps {
  taskRepo: Pick<TaskRepository, 'get' | 'setWorktree'>;
  prompt: RemovePromptFn;
  /**
   * Directory `git worktree remove` is invoked from. MUST be a path outside
   * the worktree being removed — git refuses to remove a worktree from
   * inside itself (`cannot remove the current working tree`). In practice
   * this is the repo's main checkout, which `extension.ts` passes as the
   * workspace root.
   */
  workspaceRoot: string;
}

/**
 * Inspect the worktree at `worktreePath` and report whether it is safe
 * to remove without prompting the user with a default-No.
 *
 * "Clean" requires:
 *   - `git status --porcelain` empty (no uncommitted/staged/untracked changes)
 *   - zero commits ahead of `baseBranch` (nothing un-pushed to base)
 *
 * If the worktree directory doesn't exist, treat as clean (nothing to lose).
 * If git inspection fails, prefer `dirty` to err on the side of caution.
 */
export function assessWorktreeCleanliness(
  worktreePath: string,
  baseBranch: string,
): WorktreeCleanliness {
  if (!existsSync(worktreePath)) {
    return { clean: true, reason: '', unstagedFiles: 0, commitsAhead: 0 };
  }

  const status = gitTry(worktreePath, ['status', '--porcelain']);
  if (!status.ok) {
    return {
      clean: false,
      reason: `git status failed: ${status.stderr.trim()}`,
      unstagedFiles: 0,
      commitsAhead: 0,
    };
  }
  const unstagedFiles = status.stdout.split(/\r?\n/).filter((l) => l.length > 0).length;

  const ahead = gitTry(worktreePath, ['rev-list', '--count', `${baseBranch}..HEAD`]);
  // If the base ref isn't reachable (rare during teardown / detached repos),
  // treat ahead as 0 rather than refusing to assess.
  const commitsAhead = ahead.ok ? Number.parseInt(ahead.stdout.trim() || '0', 10) : 0;

  const clean = unstagedFiles === 0 && commitsAhead === 0;
  const reasonParts: string[] = [];
  if (unstagedFiles > 0) reasonParts.push(`${unstagedFiles} uncommitted file(s)`);
  if (commitsAhead > 0) reasonParts.push(`${commitsAhead} commit(s) ahead of ${baseBranch}`);

  return {
    clean,
    reason: reasonParts.join(', '),
    unstagedFiles,
    commitsAhead,
  };
}

export interface RemoveTaskResult {
  promptShown: boolean;
  worktreeRemoved: boolean;
  cleanliness: WorktreeCleanliness | null;
}

/**
 * Encapsulates the explicit "Remove Task" cleanup path.
 *
 * Behaviours (per ADR-0011 + issue #41):
 *   - Stop / Mark Done / external close → do NOT call this. Worktrees persist.
 *   - Explicit Task Remove → call `removeTask`. We:
 *       1. If the Task has no worktree, no-op (nothing to clean up).
 *       2. Inspect cleanliness; pick a sensible default for the prompt.
 *       3. Hand off to the caller's `prompt` for the final decision.
 *       4. If confirmed: `git worktree remove [--force] <path>` and clear
 *          the Task's worktree_* columns.
 *       5. If declined: leave the worktree on disk and clear nothing.
 */
export class TaskRemover {
  constructor(private readonly deps: TaskRemoverDeps) {}

  async removeTask(taskId: number): Promise<RemoveTaskResult> {
    const task = await this.deps.taskRepo.get(taskId);
    if (!task) {
      return { promptShown: false, worktreeRemoved: false, cleanliness: null };
    }

    if (!task.worktree_path) {
      return { promptShown: false, worktreeRemoved: false, cleanliness: null };
    }

    const baseBranch = task.worktree_base_branch ?? 'main';
    const cleanliness = assessWorktreeCleanliness(task.worktree_path, baseBranch);
    const choice = await this.deps.prompt(task, cleanliness);

    if (!choice.remove) {
      return { promptShown: true, worktreeRemoved: false, cleanliness };
    }

    // `git worktree remove` must run from outside the worktree it's
    // removing; the caller-supplied workspaceRoot (the main checkout) is
    // the canonical place. Fallback-to-worktree-self was a landmine — git
    // rejects it — so the field is required.
    const cwd = this.deps.workspaceRoot;
    const args = ['worktree', 'remove'];
    if (choice.force) args.push('--force');
    args.push(task.worktree_path);
    const removeResult = gitTry(cwd, args);
    if (!removeResult.ok) {
      throw new Error(`git worktree remove failed: ${removeResult.stderr.trim()}`);
    }

    await this.deps.taskRepo.setWorktree(taskId, {
      worktree_path: null,
      worktree_branch: null,
      worktree_base_branch: null,
    });

    return { promptShown: true, worktreeRemoved: true, cleanliness };
  }
}
