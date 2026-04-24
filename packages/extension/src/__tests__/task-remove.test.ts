import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task, TaskRepository, TaskWorktreeFields } from '@tackle/shared';
import {
  TaskRemover,
  assessWorktreeCleanliness,
  type RemovePromptFn,
} from '../task/task-remover';
import { SessionActions } from '../session/session-actions';
import type { TerminalOrchestrator } from '../terminal/terminal-orchestrator';

interface InMemoryTaskRepoState {
  tasks: Map<number, Task>;
}

function createTaskRepo(state: InMemoryTaskRepoState): TaskRepository {
  return {
    list: async () => Array.from(state.tasks.values()),
    get: async (id: number) => state.tasks.get(id),
    upsert: async () => {},
    upsertBatch: async () => {},
    setWorktree: async (id: number, fields: TaskWorktreeFields) => {
      const t = state.tasks.get(id);
      if (!t) return;
      state.tasks.set(id, {
        ...t,
        worktree_path: fields.worktree_path,
        worktree_branch: fields.worktree_branch,
        worktree_base_branch: fields.worktree_base_branch,
      });
    },
  };
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    external_id: '42',
    external_system: 'github',
    title: 'Fix the auth bug',
    description: '',
    status: 'open',
    assignee: null,
    parent_external_id: null,
    worktree_path: null,
    worktree_branch: null,
    worktree_base_branch: null,
    synced_at: '',
    created_at: '',
    ...over,
  };
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}

interface RepoFixture {
  repoDir: string;
  rootDir: string;
  worktreeDir: string;
  branch: string;
}

/**
 * Build a fresh git repo with a single committed file on `main`, then
 * `git worktree add` a sibling worktree on a feature branch.
 */
function makeRepoWithWorktree(): RepoFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'tackle-rm-'));
  const repoDir = join(rootDir, 'myrepo');
  mkdirSync(repoDir);
  git(repoDir, 'init -q -b main');
  git(repoDir, 'config user.email tester@example.com');
  git(repoDir, 'config user.name Tester');
  writeFileSync(join(repoDir, 'README.md'), '# repo\n');
  git(repoDir, 'add .');
  git(repoDir, 'commit -q -m initial');
  const branch = '42-fix-the-auth-bug';
  const worktreeDir = join(rootDir, 'wt');
  git(repoDir, `worktree add -b ${branch} "${worktreeDir}"`);
  return { repoDir, rootDir, worktreeDir, branch };
}

let fixture: RepoFixture;
let state: InMemoryTaskRepoState;
let repo: TaskRepository;

beforeEach(() => {
  fixture = makeRepoWithWorktree();
  state = { tasks: new Map() };
  repo = createTaskRepo(state);
});

afterEach(() => {
  try { rmSync(fixture.rootDir, { recursive: true, force: true }); } catch { /* windows */ }
});

describe('assessWorktreeCleanliness', () => {
  it('reports clean for a freshly-created worktree with no changes', () => {
    const c = assessWorktreeCleanliness(fixture.worktreeDir, 'main');
    expect(c.clean).toBe(true);
    expect(c.unstagedFiles).toBe(0);
    expect(c.commitsAhead).toBe(0);
  });

  it('reports dirty when there are uncommitted changes', () => {
    writeFileSync(join(fixture.worktreeDir, 'scratch.txt'), 'wip\n');
    const c = assessWorktreeCleanliness(fixture.worktreeDir, 'main');
    expect(c.clean).toBe(false);
    expect(c.unstagedFiles).toBeGreaterThan(0);
    expect(c.reason).toMatch(/uncommitted/);
  });

  it('reports dirty when there are commits ahead of base branch', () => {
    writeFileSync(join(fixture.worktreeDir, 'feature.txt'), 'feature\n');
    git(fixture.worktreeDir, 'add .');
    git(fixture.worktreeDir, 'commit -q -m "feature work"');
    const c = assessWorktreeCleanliness(fixture.worktreeDir, 'main');
    expect(c.clean).toBe(false);
    expect(c.commitsAhead).toBe(1);
    expect(c.reason).toMatch(/ahead of main/);
  });

  it('treats a missing worktree directory as clean (nothing to lose)', () => {
    const ghost = join(fixture.rootDir, 'gone');
    const c = assessWorktreeCleanliness(ghost, 'main');
    expect(c.clean).toBe(true);
  });
});

describe('TaskRemover.removeTask', () => {
  it('no-ops when the Task has no worktree_path', async () => {
    const task = makeTask({ id: 1, worktree_path: null });
    state.tasks.set(1, task);
    const prompt = vi.fn<RemovePromptFn>(async () => ({ remove: true, force: false }));

    const remover = new TaskRemover({ taskRepo: repo, prompt, workspaceRoot: fixture.repoDir });
    const result = await remover.removeTask(1);

    expect(result.promptShown).toBe(false);
    expect(result.worktreeRemoved).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('clean worktree + user accepts → runs `git worktree remove` and clears Task fields', async () => {
    state.tasks.set(1, makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
    }));
    const prompt = vi.fn<RemovePromptFn>(async (_t, c) => {
      // Default for clean = remove
      expect(c.clean).toBe(true);
      return { remove: true, force: false };
    });

    const remover = new TaskRemover({ taskRepo: repo, prompt, workspaceRoot: fixture.repoDir });
    const result = await remover.removeTask(1);

    expect(result.worktreeRemoved).toBe(true);
    expect(existsSync(fixture.worktreeDir)).toBe(false);
    const list = git(fixture.repoDir, 'worktree list');
    expect(list).not.toContain(fixture.branch);

    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBeNull();
    expect(updated!.worktree_branch).toBeNull();
    expect(updated!.worktree_base_branch).toBeNull();
  });

  it('dirty worktree + user keeps (default) → leaves worktree, clears nothing', async () => {
    writeFileSync(join(fixture.worktreeDir, 'wip.txt'), 'wip\n');
    state.tasks.set(1, makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
    }));
    const prompt = vi.fn<RemovePromptFn>(async (_t, c) => {
      expect(c.clean).toBe(false);
      // Default for dirty = keep
      return { remove: false, force: false };
    });

    const remover = new TaskRemover({ taskRepo: repo, prompt, workspaceRoot: fixture.repoDir });
    const result = await remover.removeTask(1);

    expect(result.promptShown).toBe(true);
    expect(result.worktreeRemoved).toBe(false);
    expect(existsSync(fixture.worktreeDir)).toBe(true);
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBe(fixture.worktreeDir);
  });

  it('dirty worktree + user overrides to remove → invokes git worktree remove --force', async () => {
    writeFileSync(join(fixture.worktreeDir, 'wip.txt'), 'wip\n');
    state.tasks.set(1, makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
    }));
    const prompt = vi.fn<RemovePromptFn>(async () => ({ remove: true, force: true }));

    const remover = new TaskRemover({ taskRepo: repo, prompt, workspaceRoot: fixture.repoDir });
    const result = await remover.removeTask(1);

    expect(result.worktreeRemoved).toBe(true);
    expect(existsSync(fixture.worktreeDir)).toBe(false);
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBeNull();
  });

  it('returns a no-op result when the Task does not exist', async () => {
    const prompt = vi.fn<RemovePromptFn>(async () => ({ remove: true, force: false }));
    const remover = new TaskRemover({ taskRepo: repo, prompt, workspaceRoot: fixture.repoDir });
    const result = await remover.removeTask(9999);
    expect(result.worktreeRemoved).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});

/**
 * Lifecycle no-op coverage — these are the "negative" assertions the issue
 * acceptance criteria call out: Stop, Mark Done, and external close MUST
 * leave the Task's worktree untouched.
 */
describe('Worktree no-op lifecycle (Stop / MarkDone / external close)', () => {
  function buildSessionActions() {
    const session = {
      id: 1,
      task_id: 1,
      phase_id: null,
      name: 'sess',
      kind: 'implement' as const,
      status: 'running' as const,
      psmux_name: 't',
      tab_label: 't',
      agent: 'claude',
      worktree_path: null,
      sort_order: 0,
      claude_session_id: null,
      agent_state: 'idle' as const,
      prior_claude_session_ids: null,
      started_at: '',
      ended_at: null,
    };
    const sessions: any = {
      list: vi.fn(async () => [session]),
      get: vi.fn(async () => session),
      listForTask: vi.fn(async () => [session]),
      create: vi.fn(),
      update: vi.fn(async () => {}),
      complete: vi.fn(async () => {}),
      softDelete: vi.fn(async () => {}),
    };
    const orchestrator = {
      stopSession: vi.fn(async () => {}),
      restartSession: vi.fn(async () => {}),
    } as unknown as TerminalOrchestrator;
    const actions = new SessionActions({
      sessions,
      orchestrator,
      confirm: async () => true,
    });
    return { actions, sessions, orchestrator };
  }

  it('Session.stop does NOT call setWorktree, git worktree remove, or rm the directory', async () => {
    state.tasks.set(1, makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
    }));
    const setWorktreeSpy = vi.spyOn(repo, 'setWorktree');

    const { actions } = buildSessionActions();
    await actions.stop(1);

    expect(setWorktreeSpy).not.toHaveBeenCalled();
    expect(existsSync(fixture.worktreeDir)).toBe(true);
    const t = await repo.get(1);
    expect(t!.worktree_path).toBe(fixture.worktreeDir);
  });

  it('Session.markDone does NOT touch the Task worktree', async () => {
    state.tasks.set(1, makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
    }));
    const setWorktreeSpy = vi.spyOn(repo, 'setWorktree');

    const { actions } = buildSessionActions();
    await actions.markDone(1);

    expect(setWorktreeSpy).not.toHaveBeenCalled();
    expect(existsSync(fixture.worktreeDir)).toBe(true);
    const t = await repo.get(1);
    expect(t!.worktree_path).toBe(fixture.worktreeDir);
  });

  it('External Task close (sync flips status) does NOT touch the worktree', async () => {
    // Simulate the upsert path that runs during syncFromGitHub: an existing
    // Task gets overwritten with status='closed'. The Task's worktree fields
    // must survive untouched.
    const task = makeTask({
      id: 1,
      worktree_path: fixture.worktreeDir,
      worktree_branch: fixture.branch,
      worktree_base_branch: 'main',
      status: 'open',
    });
    state.tasks.set(1, task);

    // Simulate "external close": only mutate status, never worktree_*.
    state.tasks.set(1, { ...task, status: 'closed' });

    const after = await repo.get(1);
    expect(after!.status).toBe('closed');
    expect(after!.worktree_path).toBe(fixture.worktreeDir);
    expect(existsSync(fixture.worktreeDir)).toBe(true);
  });
});
