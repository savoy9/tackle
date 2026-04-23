import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorktreeProvisioner } from '../worktree/worktree-provisioner';
import type { TaskRepository, Task, TaskWorktreeFields } from '@tackle/shared';

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

function makeRepo(): { repoDir: string; rootDir: string; wtRoot: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'tackle-wt-'));
  const repoDir = join(rootDir, 'myrepo');
  const wtRoot = join(rootDir, 'wt');
  mkdirSync(repoDir);
  // Configure local user; -c flags would need to apply to every command.
  git(repoDir, 'init -q -b main');
  git(repoDir, 'config user.email tester@example.com');
  git(repoDir, 'config user.name Tester');
  writeFileSync(join(repoDir, 'README.md'), '# repo\n');
  git(repoDir, 'add .');
  git(repoDir, 'commit -q -m initial');
  return { repoDir, rootDir, wtRoot };
}

let rootDir: string;
let repoDir: string;
let wtRoot: string;
let state: InMemoryTaskRepoState;
let repo: TaskRepository;

beforeEach(() => {
  ({ repoDir, rootDir, wtRoot } = makeRepo());
  state = { tasks: new Map() };
  repo = createTaskRepo(state);
});

afterEach(() => {
  try { rmSync(rootDir, { recursive: true, force: true }); } catch { /* windows */ }
});

describe('WorktreeProvisioner.ensureWorktreeForTask', () => {
  it('creates a <id>-<slug> worktree off baseBranch on a fresh repo', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('42-fix-the-auth-bug');
    expect(result.baseBranch).toBe('main');
    expect(result.path).toBe(join(wtRoot, '42-fix-the-auth-bug'));
    expect(existsSync(result.path)).toBe(true);
    // git worktree list should include the new path
    const list = git(repoDir, 'worktree list');
    expect(list).toContain('42-fix-the-auth-bug');
    // Persisted to repo
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBe(result.path);
    expect(updated!.worktree_branch).toBe('42-fix-the-auth-bug');
    expect(updated!.worktree_base_branch).toBe('main');
  });

  it('is idempotent — second call returns same path without duplicating', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const first = await provisioner.ensureWorktreeForTask(task);
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);

    expect(second.path).toBe(first.path);
    expect(second.branch).toBe(first.branch);
    // Only the main checkout + 1 worktree
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('reuses an existing local branch when exactly one matches *<external-id>*', async () => {
    // Pre-create a branch the user already started for this issue.
    git(repoDir, 'branch feature/42-prework');

    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('feature/42-prework');
    // git worktree list checked out the existing branch
    const list = git(repoDir, 'worktree list');
    expect(list).toContain('feature/42-prework');
  });

  it('falls back to tackle/<external-id> on slug branch collision', async () => {
    // Two pre-existing branches that contain "42" → matching is ambiguous (more
    // than one), so we go to the new-branch path. Then the slug branch already
    // exists, forcing the fallback.
    git(repoDir, 'branch 42-fix-the-auth-bug');
    git(repoDir, 'branch other-42-thing');

    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('tackle/42');
    expect(existsSync(result.path)).toBe(true);
    const branches = git(repoDir, 'branch --list').split(/\r?\n/).map((s) => s.replace(/^[\* +]+/, '').trim()).filter(Boolean);
    expect(branches).toContain('tackle/42');
  });

  it('hard-fails with a clear error when workspaceRoot is not a git repo', async () => {
    // Non-git directory: a fresh tempdir with no git init.
    const nonGit = mkdtempSync(join(tmpdir(), 'tackle-nogit-'));
    try {
      const task = makeTask({ id: 1, external_id: '42', title: 'whatever' });
      state.tasks.set(1, task);
      const provisioner = new WorktreeProvisioner({ workspaceRoot: nonGit, taskRepo: repo, rootPath: wtRoot });
      await expect(provisioner.ensureWorktreeForTask(task)).rejects.toThrow(/git repo|git repository|not a git/i);
      // No partial state: Task row was not updated.
      const updated = await repo.get(1);
      expect(updated!.worktree_path).toBeNull();
    } finally {
      try { rmSync(nonGit, { recursive: true, force: true }); } catch { /* windows */ }
    }
  });

  it('silently recreates the worktree when the directory was deleted from disk', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const first = await provisioner.ensureWorktreeForTask(task);
    expect(existsSync(first.path)).toBe(true);

    // Simulate a dev manually deleting the worktree directory from disk.
    rmSync(first.path, { recursive: true, force: true });
    expect(existsSync(first.path)).toBe(false);

    // Next spawn re-runs ensureWorktreeForTask silently → should recreate.
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);
    expect(second.path).toBe(first.path);
    expect(second.branch).toBe(first.branch);
    expect(existsSync(second.path)).toBe(true);
    // git worktree list should have exactly main + the recreated worktree
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('does not inspect or mutate a dirty worktree or a manually-checked-out branch', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: repoDir, taskRepo: repo, rootPath: wtRoot });
    const first = await provisioner.ensureWorktreeForTask(task);

    // Dirty up the worktree (uncommitted file) and checkout a different branch.
    writeFileSync(join(first.path, 'dirty.txt'), 'uncommitted\n');
    git(first.path, 'checkout -q -b some-other-branch');

    // Capture state before the second call.
    const branchBefore = git(first.path, 'rev-parse --abbrev-ref HEAD');
    const dirtyBefore = existsSync(join(first.path, 'dirty.txt'));
    expect(branchBefore).toBe('some-other-branch');
    expect(dirtyBefore).toBe(true);

    // Spawning again on the same Task: should be a no-op on the worktree.
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);
    expect(second.path).toBe(first.path);

    // No branch switch, no file mutation.
    const branchAfter = git(first.path, 'rev-parse --abbrev-ref HEAD');
    expect(branchAfter).toBe('some-other-branch');
    expect(existsSync(join(first.path, 'dirty.txt'))).toBe(true);
    // No new worktree directories created.
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('when workspaceRoot is itself a worktree, returns workspaceRoot and skips nested creation', async () => {
    // Create a sibling worktree from the main repo, then point the
    // provisioner at that sibling as its workspaceRoot.
    const sibling = join(rootDir, 'sibling-wt');
    git(repoDir, `worktree add -b feature/x "${sibling}"`);

    const task = makeTask({ id: 1, external_id: '99', title: 'noop' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({ workspaceRoot: sibling, taskRepo: repo, rootPath: wtRoot });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.path).toBe(sibling);
    // No new worktree directory created under wtRoot
    expect(existsSync(wtRoot)).toBe(false);
    // Persisted
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBe(sibling);
  });
});

describe('Integration: TerminalOrchestrator + WorktreeProvisioner', () => {
  it('first Session spawn on a Task ends with psmux cwd = Task worktree', async () => {
    // Lazy import inside test to keep top-of-file diff small.
    const { TerminalOrchestrator } = await import('../terminal/terminal-orchestrator');

    const task = makeTask({ id: 1, external_id: '42', title: 'Wire it up' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });

    const sentKeys: Array<[string, string]> = [];
    const fakePsmux = {
      binary: 'tmux',
      createSession: () => undefined,
      killSession: () => undefined,
      hasSession: () => true,
      listSessions: () => [],
      sendKeys: (name: string, keys: string) => { sentKeys.push([name, keys]); },
    } as any;

    // Minimal in-memory SessionRepository
    const sessions: any[] = [];
    const sessionRepo: any = {
      list: async () => sessions,
      get: async (id: number) => sessions.find((s) => s.id === id),
      listForTask: async (tid: number) => sessions.filter((s) => s.task_id === tid),
      create: async (input: any) => {
        const s = { id: sessions.length + 1, status: 'running', ...input };
        sessions.push(s);
        return s;
      },
      update: async () => {},
      complete: async () => {},
      softDelete: async () => {},
    };

    const agentRegistry = {
      resolve: () => ({ name: 'agency-cc', command: 'agency-cc', resumeFlag: (id: string) => ['-r', id] }),
      shouldLaunch: (kind: string) => kind !== 'shell',
    } as any;

    const orchestrator = new TerminalOrchestrator(sessionRepo, fakePsmux, agentRegistry, {
      ensureForTask: async (taskId: number) => {
        const t = await repo.get(taskId);
        if (!t) throw new Error('no task');
        return provisioner.ensureWorktreeForTask(t);
      },
    });

    const session = await orchestrator.createTerminal({
      taskId: 1,
      taskSlug: 'wire-it-up',
      kind: 'implement',
    });

    const expectedPath = join(wtRoot, '42-wire-it-up');
    expect(session.worktree_path).toBe(expectedPath);
    expect(sentKeys[0][1]).toContain(`cd ${expectedPath} `);
    // Task row is updated with worktree fields
    const refreshed = await repo.get(1);
    expect(refreshed!.worktree_path).toBe(expectedPath);
    expect(refreshed!.worktree_branch).toBe('42-wire-it-up');
  });
});
